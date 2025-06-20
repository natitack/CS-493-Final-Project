const router = require("express").Router();
const mongoose = require("mongoose");

const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

const Assignment = require("../models/assignmentModel");
const Course = require("../models/courseModel");
const Submission = require("../models/submissionModel");

const { requireAuthentication } = require("./middleware/auth");

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

const canModifyAssignment = (user, course) => {
  return user.role === 'admin' ||
    (user.role === 'instructor' && (user.id || user.userId || user._id).toString() === course.instructorId.toString());
};

// POST /assignments - Create a new Assignment
router.post("/", requireAuthentication, async (req, res) => {
  try {
    const { courseId, title, points, due } = req.body;

    // Validate required fields
    if (!courseId || !title || points === undefined || !due) {
      return res.status(400).json({
        error: "Missing required fields: courseId, title, points, and due are required"
      });
    }

    if (!isValidObjectId(courseId)) {
      return res.status(400).json({
        error: "Invalid courseId"
      });
    }

    // Check if course exists and get instructor info
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(400).json({
        error: "Invalid courseId: Course not found"
      });
    }

    // Authorization check: admin or instructor of the course
    if (!canModifyAssignment(req.user, course)) {
      return res.status(403).json({
        error: "Unauthorized: Only admins or the course instructor can create assignments"// + course
      });
    }

    if (typeof points !== 'number' || points < 0) {
      return res.status(400).json({
        error: "Points must be a non-negative number"
      });
    }

    const dueDate = new Date(due);
    if (isNaN(dueDate.getTime())) {
      return res.status(400).json({
        error: "Invalid due date format"
      });
    }

    // Create new assignment
    const assignment = new Assignment({
      courseId,
      title,
      points,
      due: dueDate
    });

    const savedAssignment = await assignment.save();

    res.status(201).json({
      id: savedAssignment._id.toString()
    });

  } catch (error) {
    console.error("Error creating assignment:", error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        error: "Invalid assignment data: " + error.message
      });
    }
    res.status(500).json({
      error: "Internal server error"
    });
  }
});

// GET /assignments/:id - Fetch data about a specific Assignment
router.get("/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(404).json({
        error: "Assignment not found"
      });
    }

    const assignment = await Assignment.findById(id).populate('courseId', 'title');

    if (!assignment) {
      return res.status(404).json({
        error: "Assignment not found"
      });
    }

    res.status(200).json({
      _id: assignment._id,
      courseId: assignment.courseId,
      title: assignment.title,
      points: assignment.points,
      due: assignment.due
    });

  } catch (error) {
    console.error("Error fetching assignment:", error);
    res.status(500).json({
      error: "Internal server error"
    });
  }
});

// PATCH /assignments/:id - Update data for a specific Assignment
router.patch("/:id", requireAuthentication, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    if (!isValidObjectId(id)) {
      return res.status(404).json({
        error: "Assignment not found"
      });
    }

    // Validate update fields
    const allowedUpdates = ['title', 'points', 'due'];
    const updateKeys = Object.keys(updates);

    if (updateKeys.length === 0) {
      return res.status(400).json({
        error: "No update fields provided"
      });
    }

    const invalidFields = updateKeys.filter(key => !allowedUpdates.includes(key));
    if (invalidFields.length > 0) {
      return res.status(400).json({
        error: `Invalid update fields: ${invalidFields.join(', ')}. Allowed fields: ${allowedUpdates.join(', ')}`
      });
    }

    // Validate specific field types
    if (updates.points !== undefined && (typeof updates.points !== 'number' || updates.points < 0)) {
      return res.status(400).json({
        error: "Points must be a non-negative number"
      });
    }

    if (updates.due !== undefined) {
      const dueDate = new Date(updates.due);
      if (isNaN(dueDate.getTime())) {
        return res.status(400).json({
          error: "Invalid due date format"
        });
      }
      updates.due = dueDate;
    }

    const assignment = await Assignment.findById(id).populate('courseId');

    if (!assignment) {
      return res.status(404).json({
        error: "Assignment not found"
      });
    }

    // Authorization check
    if (!canModifyAssignment(req.user, assignment.courseId)) {
      return res.status(403).json({
        error: "Unauthorized: Only admins or the course instructor can update assignments"
      });
    }

    // Apply updates
    Object.keys(updates).forEach(key => {
      assignment[key] = updates[key];
    });

    await assignment.save();

    res.status(200).json({
      message: "Assignment updated successfully"
    });

  } catch (error) {
    console.error("Error updating assignment:", error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        error: "Invalid assignment data: " + error.message
      });
    }
    res.status(500).json({
      error: "Internal server error"
    });
  }
});

// DELETE /assignments/:id - Remove a specific Assignment
router.delete("/:id", requireAuthentication, async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(404).json({
        error: "Assignment not found"
      });
    }

    const assignment = await Assignment.findById(id).populate('courseId');

    if (!assignment) {
      return res.status(404).json({
        error: "Assignment not found"
      });
    }

    // Authorization check: admin or instructor of the course
    if (!canModifyAssignment(req.user, assignment.courseId)) {
      return res.status(403).json({
        error: "Unauthorized: Only admins or the course instructor can delete assignments"
      });
    }

    // Delete all submissions for this assignment
    await Submission.deleteMany({ assignmentId: id });

    // Delete the assignment
    await Assignment.findByIdAndDelete(id);

    res.status(204).send();

  } catch (error) {
    console.error("Error deleting assignment:", error);
    res.status(500).json({
      error: "Internal server error"
    });
  }
});

// submission related routes

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = path.join(__dirname, '..', 'uploads', 'submissions');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = crypto.randomBytes(16).toString('hex');
    const extension = path.extname(file.originalname);
    cb(null, `${Date.now()}-${uniqueSuffix}${extension}`);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: function (req, file, cb) {
    const allowedTypes = [
      'application/pdf',
      'text/plain',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/zip',
      'image/jpeg',
      'image/png',
      'text/html',
      'application/javascript',
      'text/css'
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Please upload PDF, DOC, TXT, ZIP, or image files.'));
    }
  }
});

// Helper function to check if student is enrolled in course
async function checkStudentEnrollment(studentId, courseId) {
  try {
    const course = await Course.findById(courseId);
    if (!course) return false;

    return course.students && course.students.includes(studentId);
  } catch (error) {
    console.error("Error checking enrollment:", error);
    return false;
  }
}

async function canAccessSubmissionFile(user, filename) {
  try {
    // Find the submission with this filename
    const submission = await Submission.findOne({
      file: { $regex: filename }
    }).populate({
      path: 'assignmentId',
      populate: {
        path: 'courseId'
      }
    });

    if (!submission) return false;

    // Admin can access any file
    if (user.role === 'admin') return true;

    // Instructor can access files from their courses
    if (user.role === 'instructor') {
      return (user.id || user.userId || user._id).toString() ===
        submission.assignmentId.courseId.instructorId.toString();
    }

    // Student can only access their own files
    if (user.role === 'student') {
      return (user.id || user.userId || user._id).toString() ===
        submission.studentId.toString();
    }

    return false;
  } catch (error) {
    console.error("Error checking file access:", error);
    return false;
  }
}

// GET /assignments/:id/submissions - Fetch submissions for an Assignment
router.get("/:id/submissions", requireAuthentication, async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, studentId, limit: queryLimit } = req.query;

    // Validate and set pagination parameters
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(queryLimit) || 10)); // Max 50 items per page
    const skip = (pageNum - 1) * limitNum;

    if (!isValidObjectId(id)) {
      return res.status(404).json({
        error: "Assignment not found"
      });
    }

    const assignment = await Assignment.findById(id).populate('courseId');

    if (!assignment) {
      return res.status(404).json({
        error: "Assignment not found"
      });
    }

    if (!canModifyAssignment(req.user, assignment.courseId)) {
      return res.status(403).json({
        error: "Unauthorized: Only admins or the course instructor can view submissions"
      });
    }

    // Build query
    let query = { assignmentId: id };
    if (studentId) {
      if (!isValidObjectId(studentId)) {
        return res.status(400).json({
          error: "Invalid studentId format"
        });
      }
      query.studentId = studentId;
    }

    const totalSubmissions = await Submission.countDocuments(query);
    const totalPages = Math.ceil(totalSubmissions / limitNum);

    const submissions = await Submission.find(query)
      .skip(skip)
      .limit(limitNum)
      .populate('studentId', 'name email')
      .sort({ timestamp: -1 });

    const pagination = {
      currentPage: pageNum,
      totalPages,
      totalItems: totalSubmissions,
      itemsPerPage: limitNum,
      hasNextPage: pageNum < totalPages,
      hasPrevPage: pageNum > 1
    };

    res.status(200).json({
      submissions,
      pagination
    });

  } catch (error) {
    console.error("Error fetching submissions:", error);
    res.status(500).json({
      error: "Internal server error"
    });
  }
});

// POST /assignments/:id/submissions - Create a new Submission
router.post("/:id/submissions", requireAuthentication, upload.single('file'), async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(404).json({
        error: "Assignment not found"
      });
    }

    const assignment = await Assignment.findById(id).populate('courseId');

    if (!assignment) {
      return res.status(404).json({
        error: "Assignment not found"
      });
    }

    if (req.user.role !== 'student') {
      return res.status(403).json({
        error: "Unauthorized: Only students can create submissions"
      });
    }

    // Check if file was uploaded
    if (!req.file) {
      return res.status(400).json({
        error: "No file uploaded"
      });
    }

    // Check if student is enrolled in the course
    const isEnrolled = await checkStudentEnrollment(req.user.userId, assignment.courseId._id);
    if (!isEnrolled) {
      return res.status(403).json({
        error: "Unauthorized: Student not enrolled in this course"
      });
    }


    // Generate file URL for later access - Updated to point to the correct download route
    const fileUrl = `/assignments/submissions/download/${req.file.filename}`;

    // Create submission
    const submissionData = {
      assignmentId: id,
      studentId: req.user.userId,
      timestamp: new Date(),
      file: fileUrl
    };

    const submission = new Submission(submissionData);
    const savedSubmission = await submission.save();

    res.status(201).json({
      id: savedSubmission._id.toString()
    });

  } catch (error) {
    console.error("Error creating submission:", error);

    // Clean up uploaded file if there was an error
    if (req.file && req.file.path && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    if (error.name === 'ValidationError') {
      return res.status(400).json({
        error: "Invalid submission data: " + error.message
      });
    }

    if (error.message && error.message.includes('Invalid file type')) {
      return res.status(400).json({
        error: error.message
      });
    }

    res.status(500).json({
      error: "Internal server error"
    });
  }
});

router.get("/submissions/download/:filename", requireAuthentication, async (req, res) => {
  try {
    const { filename } = req.params;

    // Check if user has permission to access this file
    const canAccess = await canAccessSubmissionFile(req.user, filename);
    if (!canAccess) {
      return res.status(403).json({
        error: "Unauthorized: Cannot access this file"
      });
    }

    // Construct file path
    const filePath = path.join(__dirname, '..', 'uploads', 'submissions', filename);

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({
        error: "File not found"
      });
    }

    // Get file stats for proper headers
    const stats = fs.statSync(filePath);

    // Set appropriate headers
    res.set({
      'Content-Type': 'application/octet-stream',
      'Content-Length': stats.size,
      'Content-Disposition': `attachment; filename="${filename}"`
    });

    // Stream the file
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);

  } catch (error) {
    console.error("Error downloading file:", error);
    res.status(500).json({
      error: "Internal server error"
    });
  }
});

exports.router = router;