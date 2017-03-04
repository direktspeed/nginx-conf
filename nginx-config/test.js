var parser = require('./'),
  repl   = require('repl'),
  vm     = require('vm');

console.log('Loading config');
parser.parse('test.conf', function(err, config) {
  if(err) throw err;

  repl.start('config> ', undefined, function(code, context, fname, cb) {
    context.config = config;
    context.parser = parser;
    try {
      cb(null, vm.runInContext(code, context, fname));
    } catch(e) {
      cb(e);
    }
  });
});
