var express = require('express');
var request = require('request');
var crypto = require('crypto');
var url = require('url');

var redis = require('./redis');

var ico = require('./ico');

var CACHE_TIME = 600;

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

function fetchAndSave(theUrl, urlHash, cb){
  grabFavicon(theUrl, function(err, icn){
    if(err || !icn){
      // ummmmm....?
    }

    var rm = redis.multi();

    if(isPNG(icn)){
      //todo extract size

      rm.hmset(urlHash, { type: 'png' } /*, callback? */);
      rm.expire(urlHash, CACHE_TIME);
      rm.setex(urlHash + ':data', CACHE_TIME * 1.5, icn.toString('base64')); // just in case :)
      rm.exec();

      cb(icn);

      return;
    }

    var icon = ico(icn);

    rm.hmset(urlHash, {
      type: 'ico',
      sizes: icon.map(function(img){ return [img.width, img.height, img.depth].join('x') }).join(',')
    });
    rm.expire(urlHash, CACHE_TIME);

    var l = icon.length;
    icon.forEach(function(img, i){
      var size = [img.width, img.height, img.depth].join('x');
      img.getPNGData(function(pngData){
        rm.setex(urlHash + ':data-' + size, CACHE_TIME * 1.5, pngData.toString('base64'));

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
    if(err || !data || !data.type){
      return fetchAndSave(theUrl, urlHash, cb);
    }

    var imgType = data.type;

    if(imgType === 'png'){
      redis.get(urlHash + ':data', function(err, pngData){
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

      redis.get(urlHash + ':data-' + size, function(err, iconData){
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

  // cache n shit

  fetchViaCache(theUrl, function(icn){
    if(!icn){
      return res.redirect(defaultIcon);
    }

    res.header('Content-Type', 'image/png');
    res.send(icn);
  });
})


app.listen(process.env.PORT || 7000);
