const router = require("express").Router();
const mongoose = require("mongoose");
const Course = require("../models/courseModel");
const User = require("../models/userModel");
const Assignment = require("../models/assignmentModel");
const { requireAuthentication, requireAdmin } = require("./middleware/auth");

exports.router = router;

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);

// Helper function to check if user can modify course
const canModifyCourse = (user, course) => {
  return user.role === 'admin' || 
         (user.role === 'instructor' && user.userId === course.instructorId.toString());
};

// route to get a list of courses
router.get('/', async(req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 10; // Set page size
    const skip = (page - 1) * limit;
    
    // Build query filters
    const filters = {};
    if (req.query.subject) {
      filters.subject = req.query.subject;
    }
    if (req.query.number) {
      filters.number = req.query.number;
    }
    if (req.query.term) {
      filters.term = req.query.term;
    }

    // Get courses without students and assignments lists
    const courses = await Course.find(filters)
      .select('-students') // Exclude students array
      .populate('instructorId', 'name email')
      .skip(skip)
      .limit(limit)
      .sort({ subject: 1, number: 1 });

    // Get total count for pagination info
    const totalCourses = await Course.countDocuments(filters);
    const totalPages = Math.ceil(totalCourses / limit);

    const response = {
      courses: courses.map(course => ({
        _id: course._id,
        subject: course.subject,
        number: course.number,
        title: course.title,
        term: course.term,
        instructorId: course.instructorId
      })),
      pagination: {
        page,
        totalPages,
        pageSize: limit,
        totalCount: totalCourses
      }
    };

    res.status(200).json(response);

  } catch (error) {
    console.error('Error fetching courses:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// route to create a new course
router.post('/', requireAuthentication, requireAdmin, async (req, res, next) => {
  try {
    const { subject, number, title, term, instructorId } = req.body;

    // Validate required fields
    if (!subject || !number || !title || !term || !instructorId) {
      return res.status(400).json({
        error: 'Missing required fields: subject, number, title, term, and instructorId are required'
      });
    }

    if (!isValidObjectId(instructorId)) {
      return res.status(400).json({
        error: 'Invalid instructorId'
      });
    }

    // Verify instructor exists and has instructor role
    const instructor = await User.findById(instructorId);
    if (!instructor) {
      return res.status(400).json({
        error: 'Instructor user not found'
      });
    }

    if (instructor.role !== 'instructor') {
      return res.status(400).json({
        error: 'Specified user is not an instructor'
      });
    }

    // Create new course
    const course = new Course({
      subject,
      number,
      title,
      term,
      instructorId,
      students: []
    });

    const savedCourse = await course.save();

    res.status(201).json({
      id: savedCourse._id.toString()
    });

  } catch (error) {
    console.error('Error creating course:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        error: 'Invalid course data: ' + error.message
      });
    }
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// route to get information on a specific course
router.get('/:id', async(req, res, next) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(404).json({
        error: 'Course not found'
      });
    }

    const course = await Course.findById(id)
      .select('-students') // Exclude students array
      .populate('instructorId', 'name email');

    if (!course) {
      return res.status(404).json({
        error: 'Course not found'
      });
    }

    res.status(200).json({
      _id: course._id,
      subject: course.subject,
      number: course.number,
      title: course.title,
      term: course.term,
      instructorId: course.instructorId
    });

  } catch (error) {
    console.error('Error fetching course:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// route to update a course's information
router.patch('/:id', requireAuthentication, async (req, res, next) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    if (!isValidObjectId(id)) {
      return res.status(404).json({
        error: 'Course not found'
      });
    }

    // Check if course exists
    const course = await Course.findById(id);
    if (!course) {
      return res.status(404).json({
        error: 'Course not found'
      });
    }

    // Authorization check
    if (!canModifyCourse(req.user, course)) {
      return res.status(403).json({
        error: 'Unauthorized: Only admins or the course instructor can modify this course'
      });
    }

    // Remove fields that cannot be updated via this endpoint
    delete updates.students;
    delete updates._id;

    // If instructorId is being updated, verify the new instructor exists and has instructor role
    if (updates.instructorId) {
      if (!isValidObjectId(updates.instructorId)) {
        return res.status(400).json({
          error: 'Invalid instructorId'
        });
      }

      const instructor = await User.findById(updates.instructorId);
      if (!instructor) {
        return res.status(400).json({
          error: 'Instructor not found'
        });
      }

      if (instructor.role !== 'instructor') {
        return res.status(400).json({
          error: 'Specified user is not an instructor'
        });
      }
    }

    // Validate that we have at least one field to update
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        error: 'No valid fields provided for update'
      });
    }

    await Course.findByIdAndUpdate(id, updates, { runValidators: true });

    res.status(200).json({
      message: 'Course updated successfully'
    });

  } catch (error) {
    console.error('Error updating course:', error);
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        error: 'Invalid update data: ' + error.message
      });
    }
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// route to delete a course
router.delete('/:id', requireAuthentication, requireAdmin, async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(404).json({
        error: 'Course not found'
      });
    }

    const course = await Course.findById(id);
    if (!course) {
      return res.status(404).json({
        error: 'Course not found'
      });
    }

    // Delete all assignments for this course
    await Assignment.deleteMany({ courseId: id });

    // Delete the course
    await Course.findByIdAndDelete(id);

    res.status(204).send();

  } catch (error) {
    console.error('Error deleting course:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// route to get a list of students enrolled in a specific course
router.get('/:id/students', requireAuthentication, async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(404).json({
        error: 'Course not found'
      });
    }

    const course = await Course.findById(id).populate('students', 'name email');
    if (!course) {
      return res.status(404).json({
        error: 'Course not found'
      });
    }

    // Authorization check
    if (!canModifyCourse(req.user, course)) {
      return res.status(403).json({
        error: 'Unauthorized: Only admins or the course instructor can view student enrollment'
      });
    }

    res.status(200).json({
      students: course.students
    });

  } catch (error) {
    console.error('Error fetching course students:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// route to enroll/unenroll students from a specific course
router.post('/:id/students', requireAuthentication, async (req, res, next) => {
  try {
    const { id } = req.params;
    const { add = [], remove = [] } = req.body;

    if (!isValidObjectId(id)) {
      return res.status(404).json({
        error: 'Course not found'
      });
    }

    const course = await Course.findById(id);
    if (!course) {
      return res.status(404).json({
        error: 'Course not found'
      });
    }

    // Authorization check
    if (!canModifyCourse(req.user, course)) {
      return res.status(403).json({
        error: 'Unauthorized: Only admins or the course instructor can modify student enrollment'
      });
    }

    // Validate student IDs and check they have student role
    const allStudentIds = [...add, ...remove];
    for (const studentId of allStudentIds) {
      if (!isValidObjectId(studentId)) {
        return res.status(400).json({
          error: `Invalid student ID: ${studentId}`
        });
      }

      const student = await User.findById(studentId);
      if (!student) {
        return res.status(400).json({
          error: `Student not found: ${studentId}`
        });
      }

      if (student.role !== 'student') {
        return res.status(400).json({
          error: `User ${studentId} is not a student`
        });
      }
    }

    // Add students (avoids duplicates)
    if (add.length > 0) {
      await Course.findByIdAndUpdate(id, {
        $addToSet: { students: { $each: add } }
      });
    }

    // Remove students
    if (remove.length > 0) {
      await Course.findByIdAndUpdate(id, {
        $pull: { students: { $in: remove } }
      });
    }

    res.status(200).json({
      message: 'Enrollment updated successfully'
    });

  } catch (error) {
    console.error('Error updating enrollment:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// route to get a list of students enrolled in a specific course, but as a CSV file
router.get('/:id/roster', requireAuthentication, async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(404).json({
        error: 'Course not found'
      });
    }

    const course = await Course.findById(id).populate('students', 'name email');
    if (!course) {
      return res.status(404).json({
        error: 'Course not found'
      });
    }

    // Authorization check
    if (!canModifyCourse(req.user, course)) {
      return res.status(403).json({
        error: 'Unauthorized: Only admins or the course instructor can download the course roster'
      });
    }

    // Generate CSV content
    let csvContent = '';
    course.students.forEach(student => {
      // Format: "studentId","Student Name","email@example.com"
      csvContent += `"${student._id}","${student.name}","${student.email}"\n`;
    });

    // Set headers for CSV download
    res.set({
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="course_${id}_roster.csv"`
    });

    res.status(200).send(csvContent);

  } catch (error) {
    console.error('Error generating roster:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});

// route to get a list of assignments in a specific course
router.get('/:id/assignments', async (req, res, next) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(404).json({
        error: 'Course not found'
      });
    }

    const course = await Course.findById(id);
    if (!course) {
      return res.status(404).json({
        error: 'Course not found'
      });
    }

    // Get all assignments for this course
    const assignments = await Assignment.find({ courseId: id })
      .select('_id title points due')
      .sort({ due: 1 });

    res.status(200).json({
      assignments: assignments
    });

  } catch (error) {
    console.error('Error fetching course assignments:', error);
    res.status(500).json({
      error: 'Internal server error'
    });
  }
});