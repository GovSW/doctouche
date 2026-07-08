const path = require('path');

module.exports = {
  entry: {
    app: './src/renderer/app.js',
    admin: './src/renderer/screens/admin.js'
  },
  target: 'web',
  output: {
    filename: '[name].bundle.js',
    path: path.resolve(__dirname, 'src/renderer')
  },
  mode: 'production'
};
