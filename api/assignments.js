const router = require("express").Router();
const mongoose = require("mongoose");
const Assignment = require("../models/assignmentModel"); // Adjust path as needed
const Course = require("../models/courseModel"); // Adjust path as needed  
const Submission = require("../models/submissionModel"); // Adjust path as needed

const { requireAuthenticationentication } = require("./middleware/auth"); // Adjust path as needed

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

    // Check if course exists and get instructor info
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(400).json({
        error: "Invalid courseId: Course not found"
      });
    }

    // Authorization check: admin or instructor of the course
    if (req.user.role !== 'admin' && 
        (req.user.role !== 'instructor' || req.user.id !== course.instructorId.toString())) {
      return res.status(403).json({
        error: "Unauthorized: Only admins or the course instructor can create assignments"
      });
    }

    // Create new assignment
    const assignment = new Assignment({
      courseId,
      title,
      points,
      due: new Date(due)
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

    if (!mongoose.Types.ObjectId.isValid(id)) {
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

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({
        error: "Assignment not found"
      });
    }

    // Check if request body contains valid update fields
    const allowedUpdates = ['title', 'points', 'due'];
    const updateKeys = Object.keys(updates);
    const isValidUpdate = updateKeys.length > 0 && 
                         updateKeys.every(key => allowedUpdates.includes(key));

    if (!isValidUpdate) {
      return res.status(400).json({
        error: "Invalid update fields. Allowed fields: title, points, due"
      });
    }

    const assignment = await Assignment.findById(id).populate('courseId');
    
    if (!assignment) {
      return res.status(404).json({
        error: "Assignment not found"
      });
    }

    // Authorization check: admin or instructor of the course
    if (req.user.role !== 'admin' && 
        (req.user.role !== 'instructor' || req.user.id !== assignment.courseId.instructorId.toString())) {
      return res.status(403).json({
        error: "Unauthorized: Only admins or the course instructor can update assignments"
      });
    }

    // Apply updates
    Object.keys(updates).forEach(key => {
      if (key === 'due') {
        assignment[key] = new Date(updates[key]);
      } else {
        assignment[key] = updates[key];
      }
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

    if (!mongoose.Types.ObjectId.isValid(id)) {
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
    if (req.user.role !== 'admin' && 
        (req.user.role !== 'instructor' || req.user.id !== assignment.courseId.instructorId.toString())) {
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

// GET /assignments/:id/submissions - Fetch submissions for an Assignment
router.get("/:id/submissions", requireAuthentication, async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, studentId } = req.query;
    const limit = 10; // Items per page
    const skip = (page - 1) * limit;

    if (!mongoose.Types.ObjectId.isValid(id)) {
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
    if (req.user.role !== 'admin' && 
        (req.user.role !== 'instructor' || req.user.id !== assignment.courseId.instructorId.toString())) {
      return res.status(403).json({
        error: "Unauthorized: Only admins or the course instructor can view submissions"
      });
    }

    // Build query
    let query = { assignmentId: id };
    if (studentId) {
      if (!mongoose.Types.ObjectId.isValid(studentId)) {
        return res.status(400).json({
          error: "Invalid studentId format"
        });
      }
      query.studentId = studentId;
    }

    const submissions = await Submission.find(query)
      .skip(skip)
      .limit(limit)
      .populate('studentId', 'name email')
      .sort({ timestamp: -1 });

    res.status(200).json({
      submissions
    });

  } catch (error) {
    console.error("Error fetching submissions:", error);
    res.status(500).json({
      error: "Internal server error"
    });
  }
});

// POST /assignments/:id/submissions - Create a new Submission
router.post("/:id/submissions", requireAuthentication, async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
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

    // Authorization check: student enrolled in the course
    if (req.user.role !== 'student') {
      return res.status(403).json({
        error: "Unauthorized: Only students can create submissions"
      });
    }

    // Check if student is enrolled in the course (you'll need to implement this logic)
    // const isEnrolled = await checkStudentEnrollment(req.user.id, assignment.courseId._id);
    // if (!isEnrolled) {
    //   return res.status(403).json({
    //     error: "Unauthorized: Student not enrolled in this course"
    //   });
    // }

    // Create submission (you'll need to handle multipart/form-data for file uploads)
    const submissionData = {
      assignmentId: id,
      studentId: req.user.id,
      timestamp: new Date(),
      ...req.body // Add other submission fields as needed
    };

    const submission = new Submission(submissionData);
    const savedSubmission = await submission.save();

    res.status(201).json({
      id: savedSubmission._id.toString()
    });

  } catch (error) {
    console.error("Error creating submission:", error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        error: "Invalid submission data: " + error.message
      });
    }
    res.status(500).json({
      error: "Internal server error"
    });
  }
});

exports.router = router;