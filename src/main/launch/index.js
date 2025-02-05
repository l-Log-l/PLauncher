const Client = require('./components/launcher');
const ElyAuthenticator = require('./components/authenticator');

module.exports = {
    Client,
    Authenticator: ElyAuthenticator // Renamed for consistency
};
