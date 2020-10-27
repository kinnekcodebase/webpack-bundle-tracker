var path = require('path');
var fs = require('fs');
var stripAnsi = require('strip-ansi');
var mkdirp = require('mkdirp');
var extend = require('deep-extend');
var lockfile = require('lockfile');

var assets = {};
var DEFAULT_OUTPUT_FILENAME = 'webpack-stats.json';
var DEFAULT_LOG_TIME = false;


function Plugin(options) {
  this.contents = {};
  this.options = options || {};
  this.options.filename = this.options.filename || DEFAULT_OUTPUT_FILENAME;
  if (this.options.logTime === undefined) {
    this.options.logTime = DEFAULT_LOG_TIME;
  }
}

Plugin.prototype.apply = function(compiler) {
    var self = this;

    compiler.plugin('compilation', function(compilation, callback) {
      compilation.plugin('failed-module', function(fail){
        var output = {
          status: 'error',
          error: fail.error.name || 'unknown-error'
        };
        if (fail.error.module !== undefined) {
          output.file = fail.error.module.userRequest;
        }
        if (fail.error.error !== undefined) {
          output.message = stripAnsi(fail.error.error.codeFrame);
        }
        self.writeOutput(compiler, output);
      });
    });

    compiler.plugin('compile', function(factory, callback) {
      self.writeOutput(compiler, {status: 'compiling'});
    });

    compiler.plugin('done', function(stats){
      if (stats.compilation.errors.length > 0) {
        var error = stats.compilation.errors[0];
        self.writeOutput(compiler, {
          status: 'error',
          error: error['name'] || 'unknown-error',
          message: stripAnsi(error['message'])
        });
        return;
      }

      var chunks = {};
      stats.compilation.chunks.map(function(chunk){
        var files = chunk.files.map(function(file){
          var F = {name: file};
          if (compiler.options.output.publicPath) {
            F.publicPath= compiler.options.output.publicPath + file;
          }
          if (compiler.options.output.path) {
            F.path = path.join(compiler.options.output.path, file);
          }
          return F;
        });
        chunks[chunk.name] = files;
      });
      var output = {
        status: 'done',
        chunks: chunks
      };

      if (self.options.logTime === true) {
        output.startTime = stats.startTime;
        output.endTime = stats.endTime;
      }

      self.writeOutput(compiler, output);
    });
};


Plugin.prototype.writeOutput = function(compiler, contents) {
  var self = this;
  var filename = this.options.filename || DEFAULT_OUTPUT_FILENAME;
  var outputDirs = [];
  var outputFilenames = [];

  if (contents && contents.chunks) {
    for (var key in contents.chunks) {
      if (!contents.chunks.hasOwnProperty(key)) continue;
      var dir = self.options.path.replace('[name]', key);
      outputDirs.push(dir);
      outputFilenames.push(path.join(dir, filename));
    }
  } else {
    var dir = self.options.path || '.';
    dir = self.options.path.replace('[name]', '');
    outputDirs = [dir];
    outputFilenames = [path.join(dir, filename)];
  }

  if (compiler.options.output.publicPath) {
    contents.publicPath = compiler.options.output.publicPath;
  }

  console.log('path', path);
  console.log('outputFilenames', outputFilenames);

  outputFilenames.forEach(function (file) {
    var lockPath = file + '.lock'
    mkdirp.sync(path.dirname(file));
    lockfile.lock(lockPath, {wait: 90*1000}, function(err){});

    if (fs.existsSync(file)){
      try {
        self.contents = JSON.parse(fs.readFileSync(file));
      } catch(err){
        console.log('unable to parse existing file so ignoring: ', file)
      }
    }

    self.contents = extend(self.contents, contents);

    var formattedContents = JSON.stringify(self.contents, null, self.options.indent);
    fs.writeFileSync(file, formattedContents);
    lockfile.unlockSync(lockPath);
  });
};

module.exports = Plugin;
