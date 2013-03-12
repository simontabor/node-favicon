var express = require('express');
var request = require('request');
var crypto = require('crypto');
var url = require('url');

var ico = require('./ico');

var app = express();

function md5(inStr){
  return crypto.createHash('md5').update(inStr).digest('hex');
}

function isPNG(buf){
  return buf.toString('hex', 0, 8) === '89504e470d0a1a0a';
}

function grabFavicon(theUrl, cb){
  var parsed = url.parse(theUrl);

  request({
    url: parsed.protocol + '//' + parsed.host + '/favicon.ico',
    encoding: null,
    timeout: '2000'
  }, function(err, response, body){
    if(err){
      return cb(err);
    }
    if(response.statusCode !== 200){
      return cb(r.statusCode)
    }
    cb(null, body);
  });
}

function extractPNGData(icoBuffer, cb){
  var icon = ico(icoBuffer);

  var img = icon.sort(function(a, b){
    return a.size > b.size ? 1 : a.size < b.size ? -1 : a.depth > b.depth ? 1 : a.depth - b.depth ? -1 : 0
  }).pop();

  img.getPNGData(cb);
}

app.get('/favicon.ico', function(req, res, next){
  res.send('not yet');
});

app.get('/*', function(req, res, next){
  var theUrl = req.params[0];
  var urlHash = md5(theUrl);

  var defaultIcon = req.param('default') || 'about:blank';

  // cache n shit

  grabFavicon(theUrl, function(err, icn){
    if(err){
      return next(err);
    }
    if(!icn){
      res.redirect(defaultIcon);
    }

    if(isPNG(icn)){
      res.header('Content-Type', 'image/png');
      res.send(icn);
    }else{
      extractPNGData(icn, function(pngData){
        res.header('Content-Type', 'image/png');
        res.send(pngData);
      });
    }
  });
})


app.listen(process.env.PORT || 7000);
