var bmp = require('./ico-bmp');
var png = require('png').Png;

// TODO infer color depth from type

function numImages(buffr){
  if(buffr.readUInt16LE(0) !== 0) throw 'Invalid ICO file';
  if(buffr.readUInt16LE(2) !== 1) throw 'Not an ICO file';

  return buffr.readUInt16LE(4);
}

function parseImageData(buffr){
  return {
    width: buffr.readUInt8(0),
    height: buffr.readUInt8(1),
    depth: buffr.readUInt16LE(6),
    imgSize: buffr.readUInt32LE(8),
    imgOffset: buffr.readUInt32LE(12)
  };
}

function parseImages(buffr){
  var imgs = numImages(buffr);

  var images = [];

  for(var i = 0; i < imgs; i +=1){
    var img = parseImageData(buffr.slice(6 + i * 16, 22 + i * 16));

    var imgData = buffr.slice(img.imgOffset, img.imgOffset + img.imgSize);

    var dataType = imgData.slice(1,4).toString('binary') === 'PNG' ? 'png' : 'bmp';

    if(dataType === 'bmp' && !img.depth){
      img.depth = imgData.readUInt16LE(14);
    }

    img.getPNGData = function(imgData, img){ return function(cb){
      if('png' === dataType){
        process.nextTick(function(){
          cb(imgData);
        });
      }else{
        try{
          var b = bmp(imgData)
        }catch(e){
          console.log(e);
          return cb(null);
        }
        var pp = new png(b, img.width, img.height, 'bgra');
        pp.encode(function(data){
          cb(data);
        });
      }
    }}(imgData, img);

    images.push(img);
  }

  return images.sort(function(a, b){
    return a.width > b.width ? 1 : a.width < b.width ? -1 :
           a.depth > b.depth ? 1 :a.depth - b.depth ? -1 : 0;
  })
}


module.exports = parseImages;
