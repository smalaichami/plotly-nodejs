var https = require('https');
var http = require('http');
var json_status = require('./statusmsgs.json');
var url = require('url');
var request = require('request');
var fs = require('fs');
var mkdirp = require("mkdirp");
var getDirName = require("path").dirname;

module.exports = Plotly;

function Plotly(username,api_key) {
  if (!(this instanceof Plotly))  {
    return new Plotly(username,api_key);
  }

  if (typeof username === 'object') {
    this.username = opts.username;
    this.api_key = opts.api_key;
    this.host = opts.host || 'plot.ly';
    this.port = opts.port || 443;
  } else {
    this.username = username;
    this.api_key = api_key;
    this.host = 'plot.ly';
    this.port = 443;
  }
  this.stream_host = '';
  this.version="0.0.2";
  this.platform="nodejs";
  this.origin="plot";
}

Plotly.prototype.signup = function(username, email, callback) {
  var self = this;
  
  if (!callback) { callback = function() {}; }

  var pack = {'version': this.version, 'un': username, 'email': email, 'platform':this.platform };
  var urlencoded = '';

  for (var key in pack) {
    urlencoded += key + "=" + pack[key] + "&";
  }
  urlencoded = urlencoded.substring(0, urlencoded.length - 1);

  var options = {
    host: self.host || 'plot.ly',
    port: self.port || 443,
    path: '/apimkacct',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': urlencoded.length
    }
  };

  var req = https.request(options, function (res) {
    parseRes(res, function (err, body) {
      body = JSON.parse(body);
      if (err || res.statusCode !== 200) {
        callback({err: err, body: body, statusCode: res.statusCode});
      } else {
        self.username = body.un;
        self.api_key = body.api_key;
        callback(null, {
          un: body.un,
          api_key: body.api_key,
          tmp_pw: body.tmp_pw,
          msg: body.message,
          error: body.error,
          statusCode: res.statusCode
        });
      }
    });
  });

  req.on('error', function(err) {
    callback(err);
  });

  req.write(urlencoded);
  req.end();
};

Plotly.prototype.plot = function(data, graph_options, callback) {
  var self = this;
  if (!callback) { callback = function() {}; }

  // allow users to just pass in an object for the data, data = {x:[],y:[]}
  if (!Array.isArray(data)) data = [data];

  var urlencoded = '';
  var pack = {
    'platform': self.platform,
    'version': self.version,
    'args': JSON.stringify(data),
    'kwargs': JSON.stringify(graph_options),
    'un': self.username,
    'key': self.api_key,
    'origin': self.origin
  };

  for (var key in pack) {
    urlencoded += key + "=" + pack[key] + "&";
  }

  // trim off last ambersand
  urlencoded = urlencoded.substring(0, urlencoded.length - 1);

  var options = {
    host: self.host,
    port: self.port,
    path: '/clientresp',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': urlencoded.length
    },
    withCredentials: false
  };

  var req = https.request(options, function (res) {
    parseRes(res, function (err, body) {
      body = JSON.parse(body);
      if ( body['stream-status'] != undefined) {
        self.stream_host = url.parse(body['stream-host']).hostname;
      }
      if ( body.error.length > 0 ) {
        callback({msg: body.error, body: body, statusCode: res.statusCode});
      } else {
        callback(null, {
          streamstatus : body['stream-status'],
          url: body.url,
          message: body.message,
          warning: body.warning,
          filename: body.filename,
          error: body.error
        });
      }
      
    });
  });

  req.on('error', function(err) {
    callback(err);
  });

  req.write(urlencoded);
  req.end();
};

Plotly.prototype.stream = function(token, callback) {
  var self = this;

  var options = {
    host: self.stream_host || 'stream.plot.ly',
    port: 80,
    path: '/',
    method: 'POST',
    agent: false,
    headers: { "plotly-streamtoken" : token }
  };

  if (!callback) { callback = function() {}; }

  var stream = http.request(options, function(res) {
    var message = json_status[res.statusCode];
    if (res.statusCode !== 200) {
      callback({msg : message, statusCode: res.statusCode});
    } else {
      callback(null, {msg : message, statusCode: res.statusCode});
    }
  });

  if (stream.setTimeout) stream.setTimeout(Math.pow(2, 32) * 1000);
  return stream;
};


Plotly.prototype.get_figure = function (file_owner, file_id, callback) {
  var self = this;

  if (!callback) { callback = function() {}; }

  var headers = {
    'plotly-username': this.username,
    'plotly-apikey': this.api_key,
    'plotly-version': this.version,
    'plotly-platform': this.platform
  };

  var resource = '/apigetfile/'+file_owner+'/'+file_id;

  var options = {
    url: 'https://' + self.host + resource,
    headers: headers,
    method: 'GET'
  };

  request(options, function (err, res, body) {
    if (JSON.parse(body).error) {
      callback(JSON.parse(body).error);
    } else {
      var figure = JSON.parse(body).payload.figure;
      callback(null, figure);
    }
  });
}

Plotly.prototype.save_image = function (figure, path, callback) {
  var self = this;

  var headers = {
    'plotly-username': self.username,
    'plotly-apikey': self.api_key,
    'plotly-version': self.version,
    'plotly-platform': self.platform
  };

  if (self.port === 443) {
    protocol_str = 'https://'
  } else {
    protocol_str = 'http://'
  }

  var options = {
    url: protocol_str + self.host + '/apigenimage/',
    headers: headers,
    method: 'POST',
    body: JSON.stringify(figure)
  };

  //console.log(options);

  request.post(options, function (err, res, body) {
    if (JSON.parse(body).error) {
      callback(JSON.parse(body).error);
    } else {
      var image = JSON.parse(body).payload;
      writeFile(path, image, function (err) {
        if (err) {
          callback(err);
        } else {
          console.log('image saved!');
          callback(null);
        }
      });
    }
  });
}


// helper fn to create folders if they don't exist in the path
function writeFile (path, image, cb) {
  mkdirp(getDirName(path), function (err) {
    if (err) return cb(err)
      fs.writeFile(path + '.png', image, 'base64', cb)
  });
}


// response parse helper fn
function parseRes (res, cb) {
  var body = '';
  if ('setEncoding' in res) {
    res.setEncoding('utf-8');
  }
  res.on('data', function (data) {
    body += data;
    if (body.length > 1e4) {
      // FLOOD ATTACK OR FAULTY CLIENT, NUKE REQ
      res.connection.destroy();
      res.writeHead(413, {'Content-Type': 'text/plain'});
      res.end("req body too large");
      return cb("body overflow");
    }
  });

  res.on('end', function () {
    cb(null, body);
  });

}
