var htmlparser = require('htmlparser');
var express = require('express');
var crypto = require('crypto');
var https = require('https');
var http = require('http');
var url = require('url');

var redis = require('./redis');

var ico = require('./ico');

var CACHE_TIME = 600;
var cache = false;

var app = express();

function md5(inStr){
  return crypto.createHash('md5').update(inStr).digest('hex');
}

function isPNG(buf){
  return buf.toString('hex', 0, 8) === '89504e470d0a1a0a';
}


// TODO timeouts, max redirects
function resolve(reqUrl, saveResponse, cb){
  var urlHash = md5(reqUrl)

  redis.get('url:' + urlHash, function(err, urlData){
    if(urlData && urlData.charAt(0) === 'R'){ // redirect
      return resolve(urlData.slice(1), saveResponse, cb);
    }
    if(urlData && urlData.charAt(0) === 'E'){ // error
      return cb(urlData.slice(1));
    }
    if(urlData && urlData.charAt(0) === 'H'){ // hit
      if(saveResponse){
        return cb(null, new Buffer(urlData.slice(1), 'base64'));
      }
    }

    var parsed = url.parse(reqUrl);

    parsed.headers = {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.28 (KHTML, like Gecko) Chrome/26.0.1397.2 Safari/537.28'
    };

    var req = (/https:/.test(reqUrl) ? https : http).get(parsed);

    req.on('response', function(res){
      if(res.statusCode >= 400){
        cb(res.statusCode);
        redis.setex('url:' + urlHash, CACHE_TIME / 10, 'E' + res.statusCode);
        return;
      }
      if(res.headers && res.headers.location){
        var newUrl = url.resolve(reqUrl, res.headers.location);

        req.abort();

        redis.setex('url:' + urlHash, CACHE_TIME, 'R' + newUrl);

        resolve(newUrl, saveResponse, cb);
      } else {
        if(saveResponse){
          var bufBits = [];
          res.on('data', function(d){ bufBits.push(d); });
          res.on('end', function(){
            var responseBuffer = Buffer.concat(bufBits);
            cb(null, responseBuffer, reqUrl);

            redis.setex('url:' + urlHash, CACHE_TIME, 'H' + responseBuffer.toString('base64'));
          });
        }else{
          res.req = req;
          cb(null, res, reqUrl);
        }
      }
    });

    req.on('error', function(){
      cb('ohnoes', null);
    });
  });
}

function findLink(parsedHtml){
  for(var i = 0; i < parsedHtml.length; i += 1){
    var el = parsedHtml[i];

    if(el.name === 'link' &&
       el.attribs &&
       el.attribs.rel &&
       /^(shortcut|icon|shortcut icon)$/i.test(el.attribs.rel) &&
       el.attribs.href
    ){
      return el.attribs.href;
    }

    if(el.children){
      var l = findLink(el.children);
      if(l) return l;
    }
  }
}

function grabFavicon(theUrl, cb){
  resolve(theUrl, false, function(err, response, resolvedUrl){
    if(err || !response){
      return grabFaviconIco(theUrl, cb);
    }

    var handler = new htmlparser.DefaultHandler();
    var parser = new htmlparser.Parser(handler);
    var found = false;

    response.on('data', function(data){
      if(found) return;
      parser.parseChunk(data);

      var link = findLink(handler.dom);
      if(link){
        response.req.abort();
        found = true;
        resolve(
          url.resolve(resolvedUrl, link),
          true,
          function(err, d){
            if(d && !err) return cb(err, d);
            grabFaviconIco(theUrl, cb);
          }
        )
      }
    });

    response.on('end', function(){
      if(!found){
        grabFaviconIco(theUrl, cb);
      }
    })
  });
}

function grabFaviconIco(theUrl, cb){
  var parsed = url.parse(theUrl);

  resolve(
    parsed.protocol + '//' + parsed.host + '/favicon.ico',
    true,
    cb
  );
}

function fetchAndSave(theUrl, urlHash, cb){
  grabFavicon(theUrl, function(err, icn){
    if(err || !icn){
      // ummmmm....?
      console.error(arguments);
      console.trace();
      cb(null);
      return;
    }

    var icnHash = md5(icn);

    var rm = redis.multi();

    if(isPNG(icn)){
      //todo extract size

      rm.hmset(urlHash, { type: 'png', icon: icnHash } /*, callback? */);
      rm.expire(urlHash, CACHE_TIME);
      rm.setex(icnHash + ':data', CACHE_TIME * 1.5, icn.toString('base64')); // just in case :)
      rm.exec();

      cb(icn);

      return;
    }

    try{
      var icon = ico(icn);
    }catch(e){
      return cb(null);
    }

    rm.hmset(urlHash, {
      type: 'ico',
      sizes: icon.map(function(img){ return [img.width, img.height, img.depth].join('x') }).join(','),
      icon: icnHash
    });
    rm.expire(urlHash, CACHE_TIME);

    var l = icon.length;
    icon.forEach(function(img, i){
      var size = [img.width, img.height, img.depth].join('x');
      img.getPNGData(function(pngData){
        if(pngData) rm.setex(icnHash + ':data-' + size, CACHE_TIME * 1.5, pngData.toString('base64'));

        // TODO don't naively choose the last one, do it properly
        if(i === icon.length - 1){
          cb(pngData);
        }

        if(!--l){
          rm.exec();
        }
      });
    });
  })
}


function fetchViaCache(theUrl, cb){
  var urlHash = md5(theUrl);

  redis.hgetall(urlHash, function(err, data){
    if(!cache || err || !data || !data.type || !data.icon){
      return fetchAndSave(theUrl, urlHash, cb);
    }

    var imgType = data.type;

    var iconHash = data.icon;

    if(imgType === 'png'){
      redis.get(iconHash + ':data', function(err, pngData){
        if(err || !pngData){
          return fetchAndSave(theUrl, urlHash, cb);
        }

        cb(new Buffer(pngData, 'base64'));
      });

      return;
    }

    if(imgType === 'ico'){
      var sizes = data.sizes.split(',');

      // TODO intelligent. For now just get the biggest best icon
      var size = sizes[sizes.length - 1];

      var dims = size.split('x');

      redis.get(iconHash + ':data-' + size, function(err, iconData){
        if(err || !iconData){
          return fetchAndSave(theUrl, urlHash, cb);
        }

        cb(new Buffer(iconData, 'base64'));
      });

      return;
    }
  });
}

app.get('/favicon.ico', function(req, res, next){
  res.send('not yet');
});

app.get('/*', function(req, res, next){
  var theUrl = req.params[0];
  var urlHash = md5(theUrl);

  var defaultIcon = req.param('default') || 'about:blank';

  fetchViaCache(theUrl, function(icn){
    if(!icn){
      res.header('Cache-Control', 'public, max-age=60');
      res.header('Content-Type', 'image/png');
      // 1px transparent png
      res.send(new Buffer('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAACklEQVR4nGMAAQAABQABDQottAAAAABJRU5ErkJggg==', 'base64'));
      return;
    }

    res.header('Cache-Control', 'public, max-age=86400');
    res.header('Content-Type', 'image/png');
    res.send(icn);
  });
})


app.listen(process.env.PORT || 7000);
