const mongoose = require("mongoose");


const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  email: {
    type: String,
    required: true,
    unique: true,
  },
  password: {
    type: String,
    required: true,
  },
  role: {
    type: String,
    enum: ['admin', 'instructor', 'student'],
    default: 'student',
    required: true
  }
});
userSchema.virtual('coursesTaught', {
  ref: 'Course',
  localField: '_id',
  foreignField: 'instructorId'
});

userSchema.virtual('coursesEnrolled', {
  ref: 'Course',
  localField: '_id',
  foreignField: 'students'
});

module.exports = mongoose.model('User', userSchema);