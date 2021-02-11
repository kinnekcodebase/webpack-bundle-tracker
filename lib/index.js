var path = require('path');
var fs = require('fs');
var stripAnsi = require('strip-ansi');
var mkdirp = require('mkdirp');
var extend = require('deep-extend');
var lockfile = require('lockfile');

// @ts-ignore
var assets = {};
var DEFAULT_OUTPUT_FILENAME = 'webpack-stats.json';
var DEFAULT_LOG_TIME = false;

function Plugin(options) {
  // @ts-ignore
  this.contents = {};
  // @ts-ignore
  this.options = options || {};
  // @ts-ignore
  this.options.filename = this.options.filename || DEFAULT_OUTPUT_FILENAME;
  // @ts-ignore
  if (this.options.logTime === undefined) {
    // @ts-ignore
    this.options.logTime = DEFAULT_LOG_TIME;
  }
}

Plugin.prototype.apply = function(compiler) {
  var self = this;

  // @ts-ignore
  const _compilation = function(compilation, callback) {
    const failedModule = function(fail) {
      var output = {
        status: 'error',
        error: fail.error.name || 'unknown-error',
      };
      if (fail.error.module !== undefined) {
        output.file = fail.error.module.userRequest;
      }
      if (fail.error.error !== undefined) {
        // @ts-ignore
        output.message = stripAnsi(fail.error.error.codeFrame);
      } else {
        output.message = '';
      }
      self.writeOutput(compiler, output);
    };

    if (compilation.hooks) {
      const plugin = { name: 'BundleTrackerPlugin' };
      compilation.hooks.failedModule.tap(plugin, failedModule);
    } else {
      compilation.plugin('failed-module', failedModule);
    }
  };

  // @ts-ignore
  const compile = function(factory, callback) {
    self.writeOutput(compiler, { status: 'compiling' });
  };

  const done = function(stats) {
    if (stats.compilation.errors.length > 0) {
      var error = stats.compilation.errors[0];
      self.writeOutput(compiler, {
        status: 'error',
        error: error['name'] || 'unknown-error',
        // @ts-ignore
        message: stripAnsi(error['message']),
      });
      return;
    }

    var chunks = {};
    stats.compilation.chunks.map(function(chunk) {
      var files = chunk.files.map(function(file) {
        var F = { name: file };
        var publicPath = self.options.publicPath || compiler.options.output.publicPath;
        if (publicPath) {
          F.publicPath = publicPath + file;
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
      chunks: chunks,
    };

    if (self.options.logTime === true) {
      output.startTime = stats.startTime;
      output.endTime = stats.endTime;
    }

    self.writeOutput(compiler, output);
  };

  if (compiler.hooks) {
    const plugin = { name: 'BundleTrackerPlugin' };
    compiler.hooks.compilation.tap(plugin, _compilation);
    compiler.hooks.compile.tap(plugin, compile);
    compiler.hooks.done.tap(plugin, done);
  } else {
    compiler.plugin('compilation', _compilation);
    compiler.plugin('compile', compile);
    compiler.plugin('done', done);
  }
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

  var publicPath = self.options.publicPath || compiler.options.output.publicPath;

  if (publicPath) {
    contents.publicPath = publicPath;
  }

  outputFilenames.forEach(function (file) {
    var lockPath = file + '.lock'
    mkdirp.sync(path.dirname(file));
    lockfile.lock(lockPath, {wait: 90 * 1000}, function(err) {});

    if (fs.existsSync(file)) {
      try {
        self.contents = JSON.parse(fs.readFileSync(file));
      } catch(err) {
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