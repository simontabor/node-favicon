var request = require('request');

var express = require('express');

var urlp = require('url');

var app = express();

app.get('/',
  function(req,res,next) {
    if (!req.query.url) return res.send('specify an url');

    var url = urlp.parse(req.query.url);

    url.base = url.protocol + '//' + url.host;

    req.url = url;

    req.favicon = url.base+'/favicon.ico';

    next();
  },
  function(req,res,next) {

    request({
      url: req.favicon,
      encoding: 'binary',
      timeout: 2000
    },function(e,r,body) {
      if (e || r.statusCode !== 200 || !body) {
        return next();
      }
      req.data = body;
      next();
    });
  },
  function(req,res,next) {
    if (req.data) return next();

    request({
      url: req.url.href,
      timeout: 2000
    },function(e,r,body) {
      if (e || r.statusCode !== 200 || !body) {
        return next();
      }
      var links = body.match(/<link(.*?)>/g);
      for (var i = 0; i < links.length; i++) {
        var link = links[i];
        link = '<link rel="shortcut" href="/icon.png">';
        var fav = /rel=('|").*?(shortcut|icon).*?('|")/.test(link);
        if (!fav) continue;
        var href = link.match(/href=('|")(.*?)('|")/);
        if (!href[2]) continue;

        href = urlp.parse(href[2]);

        var requrl;
        if (href.host) {
          requrl = href.href;
        } else {
          // relative probs
          requrl = req.url.base + href.path;
        }
        request({
          url: requrl,
          encoding: 'binary',
          timeout: 2000
        },function(e,r,body) {
          if (e || r.statusCode !== 200 || !body) {
            return next();
          }
          req.data = body;
          next();
        });

        break;


      }
    });
  },
  function(req,res) {
    if (!req.data) {
      if (req.query.default) {
        return res.redirect(req.query.default);
      }
    }
    res.writeHead(200,{
      'Content-Type': 'image/x-icon',
      'Access-Control-Allow-Origin':'*',
      'Cache-Control':'public, max-age=2592000'
    });
    res.end(req.data,'binary');
  }
);


app.listen(3001);