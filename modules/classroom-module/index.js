const handlers = require('./handlers');
const database = require('./database');
const service = require('./service');

module.exports = {
  handleClassroomMessage: handlers.handleMessage,
  setMainMenuProvider: handlers.setMainMenuProvider,
  database,
  service
};

