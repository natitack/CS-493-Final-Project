const mongoose = require("mongoose");

const courseSchema = new mongoose.Schema({
  subject: {
    type: String,
    required: true,
  },
  number: {
    type: String,
    required: true,
  },
  title: {
    type: String,
    required: true,
  },
  term: {
    type: String,
    required: true,
  },
  instructorId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
 },
  students: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  }]
});

courseSchema.virtual('assignments', {
  ref: 'Assignment',
  localField: '_id',
  foreignField: 'courseId'
});

module.exports = mongoose.model('Course', courseSchema);