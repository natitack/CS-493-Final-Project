const router = require("express").Router();

const mongoose = require("mongoose");

exports.router = router;


//route to get a list of courses
router.get('/courses', async(req, res) => {

});


//route to create a new course
router.post('/courses', async (req, res, next) => {

});

//route to get information on a specific course
router.get('/courses/:id', async(req, res, next) => {

});

//route to update a course's information
router.patch('/courses/:id', async (req, res, next) => {

});

//route to delete a course
router.delete('/courses/:id', async (req, res, next) => {

});

//route to get a list of students enrolled in a specific course
router.get('/courses/:id/students', async (req, res, next) => {

});


//route to enroll/unenroll students from a specific course
router.post('/courses/:id/students', async (req, res, next) => {

});

//route to get a list of students enrolled in a specific course, but as a CSV file
router.get('/courses/:id/roster', async (req, res, next) => {

});

//route to get a list of assignments in a specific course
router.get('/courses/:id/assignments', async (req, res, next) => {

});