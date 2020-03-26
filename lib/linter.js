'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }(); /**
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     * Node dependencies
                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     **/


/**
* NPM dependencies
**/


/**
* Local dependencies
**/


var _fs = require('fs');

var _fs2 = _interopRequireDefault(_fs);

var _path = require('path');

var _path2 = _interopRequireDefault(_path);

var _os = require('os');

var _os2 = _interopRequireDefault(_os);

var _child_process = require('child_process');

var _eslint = require('eslint');

var _globUtils = require('eslint/lib/util/glob-utils.js');

var _glob = require('glob');

var _glob2 = _interopRequireDefault(_glob);

var _formatter = require('./formatter');

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var cpuCount = _os2.default.cpus().length;

function hasEslintCache(options) {
  var cacheLocation = options.cacheFile || options.cacheLocation || _path2.default.join(options.cwd || process.cwd(), '.eslintcache');
  try {
    _fs2.default.accessSync(_path2.default.resolve(cacheLocation), _fs2.default.F_OK);
    return true;
  } catch (e) {
    return false;
  }
}

function eslintFork(options, files) {
  return new Promise(function (resolve, reject) {
    var eslintChild = (0, _child_process.fork)(_path2.default.resolve(__dirname, 'linter'));
    eslintChild.on('message', function (report) {
      if (report.errorCount || report.warningCount) {
        console.log((0, _formatter.formatResults)(report.results));
      }
      resolve(report);
    });
    eslintChild.on('exit', function (code) {
      if (code !== 0) {
        reject('Linting failed');
      }
    });
    eslintChild.send({ options: options, files: files });
  });
}

var Linter = function () {
  function Linter(options) {
    _classCallCheck(this, Linter);

    this._options = options;
    this._engine = new _eslint.CLIEngine(options);
  }

  _createClass(Linter, [{
    key: 'run',
    value: function run(files) {
      var _this = this;

      return new Promise(function (resolve) {
        var report = _this._engine.executeOnFiles(files);
        if (_this._options.fix) {
          _eslint.CLIEngine.outputFixes(report);
        }

        if (_this._options.quiet) {
          report.results = _eslint.CLIEngine.getErrorResults(report.results);
        }
        resolve(report);
      });
    }
  }, {
    key: 'execute',
    value: function execute(patterns) {
      var _this2 = this;

      return new Promise(function (resolve, reject) {
        var files = (0, _globUtils.listFilesToProcess)(patterns, _this2._options).map(function (f) {
          return f.filename;
        });

        var hasCache = hasEslintCache(_this2._options);

        if (!hasCache && files.length > 50 && cpuCount >= 2) {
          (function () {
            // too many items, need to spawn process (if machine has multi-core)
            var totalCount = {
              errorCount: 0,
              warningCount: 0
            };
            var chunckedPromises = [];
            var chunkSize = Math.ceil(files.length / cpuCount);
            for (var i = 0; i < files.length; i += chunkSize) {
              var chunkedPaths = files.slice(i, i + chunkSize);
              var chunckedPromise = eslintFork(_this2._options, chunkedPaths);
              chunckedPromise.then(function (report) {
                totalCount.errorCount += report.errorCount;
                totalCount.warningCount += report.warningCount;
              });
              chunckedPromises.push(chunckedPromise);
            }
            Promise.all(chunckedPromises).then(function () {
              resolve(totalCount);
            });
          })();
        } else {
          _this2.run(files).then(function (report) {
            if (report.errorCount || report.warningCount) {
              console.log((0, _formatter.formatResults)(report.results));
            }
            resolve(report);
          }, reject);
        }
      });
    }
  }]);

  return Linter;
}();

exports.default = Linter;


process.on('message', function (_ref) {
  var options = _ref.options,
      files = _ref.files;

  // make sure to ignore message to other nested processes
  if (files) {
    new Linter(options).run(files).then(function (report) {
      process.send(report);
    }, function (err) {
      console.log(err);
      process.exit(1);
    });
  }
});