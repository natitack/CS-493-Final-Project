const router = module.exports = require('express').Router();

router.use('/assignments', require('./assignments').router);
router.use('/courses', require('./courses').router);
router.use('/users', require('./users').router);
