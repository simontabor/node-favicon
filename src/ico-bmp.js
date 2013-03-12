var pixelData = module.exports = function(buf){
  // header size
  // TODO implement for non-32-bit bitmaps
  var headerLength = buf.readUInt32LE(0);
  var width = buf.readInt32LE(4);
  var height = buf.readInt32LE(8) / 2;
  var depth = buf.readUInt16LE(14);

  var compressionMethod = buf.readUInt32LE(16);

  if(compressionMethod !== 0){
    throw 'Only BI_RGB compression method supported';
  }

  var colorsInPalette = buf.readUInt32LE(32) || 1 << depth;



  var rgbaData;

  switch(depth){
    case 32:
      rgbaData = parse32bit(buf, headerLength, width, height);
      break;
    case 24:
      rgbaData = parse24bit(buf, headerLength, width, height);
      break;
    case 16:
      rgbaData = parse16bit(buf, headerLength, width, height);
      break;
    case 8:
      rgbaData = parse8bit(buf, headerLength, width, height, colorsInPalette);
      break;
    case 4:
      rgbaData = parse4bit(buf, headerLength, width, height, colorsInPalette);
      break;
    default:
      throw depth + '-bit color not supported yet';
  }


  // for some stupid crazy reason node-png inverts alpha
  for(var i = 3; i < rgbaData.length; i += 4){
    rgbaData[i] = 255 - rgbaData[i];
  }

  return rgbaData;
}

// TODO EXTREMELY untested
function applyAndMask(buf, rgbaData, width, height, position){
  for(var i = 0; i < height; ++i){
    for(var j = 0; j < width; j++){
      var x = buf[position + ((i * width + j) >>> 3)] >> (7 ^ j & 7) & 1;
      rgbaData[width * 4 * (height - i - 1) + j * 4 + 3] = 255 * (1-x);
    }
  }
}

function readPalette(buf, headerLength, colorsInPalette){
  var b = new Buffer(colorsInPalette * 4);
  buf.copy(b, 0, headerLength, headerLength + colorsInPalette * 4);

  for(var i = 3; i < b.length; i += 4){
    b[i] = 255;
  }

  return b;
}


function parse32bit(buf, headerLength, width, height){
  var rgbaData = new Buffer(width * height * 4);

  var lineLength = width * 4;

  // BMP renders bottom-to-top, png renders top-to-bottom
  for(var i = 0; i < height; ++i){
    var p = headerLength + lineLength * i;
    buf.copy(rgbaData, lineLength * (height - i - 1), p, p + lineLength);
  }

  return rgbaData;
}

// TODO untested
function parse24bit(buf, headerLength, width, height){
  var rgbaData = new Buffer(width * height * 4);

  var lineLength = width * 3;

  var rgbPos = 0;

  // BMP renders bottom-to-top, png renders top-to-bottom
  for(var i = 0; i < height; ++i){
    var sourcePos = headerLength + lineLength * (height - i - 1);
    for(var j = 0; j < width; ++j){
      rgbaData[rgbPos++] = buf[sourcePos++];
      rgbaData[rgbPos++] = buf[sourcePos++];
      rgbaData[rgbPos++] = buf[sourcePos++];
      rgbaData[rgbPos++] = 255;
    }
  }

  applyAndMask(buf, rgbaData, width, height, headerLength + lineLength * height);

  return rgbaData;
}

// TODO untested
function parse16bit(buf, headerLength, width, height){
  var rgbaData = new Buffer(width * height * 4);

  var lineLength = width * 2;

  var rgbPos = 0;

  // BMP renders bottom-to-top, png renders top-to-bottom
  for(var i = 0; i < height; ++i){
    var sourcePos = headerLength + lineLength * (height - i - 1);
    for(var j = 0; j < width; ++j){
      var b1 = buf[sourcePos++];
      var b2 = buf[sourcePos++];
      rgbaData[rgbPos++] = 0xff & ((b1 >> 3) / 31 * 255);
      rgbaData[rgbPos++] = 0xff & (((b1 & 5) << 2 | (b2 >> 6)) / 31 * 255);
      rgbaData[rgbPos++] = 0xff & (((b2 >> 1) & 31) / 31 * 255);
      rgbaData[rgbPos++] = 255;
    }
  }

  applyAndMask(buf, rgbaData, width, height, headerLength + lineLength * height);

  return rgbaData;
}

// TODO untested
function parse8bit(buf, headerLength, width, height, colorsInPalette){
  var palette = readPalette(buf, headerLength, colorsInPalette);

  var rgbaData = new Buffer(width * height * 4);

  var lineLength = width;

  var rgbPos = 0;

  // BMP renders bottom-to-top, png renders top-to-bottom
  for(var i = 0; i < height; ++i){
    var sourcePos = headerLength + colorsInPalette * 4 + lineLength * (height - i - 1);
    for(var j = 0; j < width; ++j){
      var b = buf[sourcePos++];
      palette.copy(rgbaData, rgbPos, b * 4, b * 4 + 4);
      rgbPos += 4;
    }
  }

  applyAndMask(buf, rgbaData, width, height, headerLength + colorsInPalette * 4 + lineLength * height);

  return rgbaData;
}

// TODO untested
function parse4bit(buf, headerLength, width, height, colorsInPalette){
  var palette = readPalette(buf, headerLength, colorsInPalette);

  var rgbaData = new Buffer(width * height * 4);

  var lineLength = width / 2;

  var rgbPos = 0;

  // BMP renders bottom-to-top, png renders top-to-bottom
  for(var i = 0; i < height; ++i){
    var sourcePos = headerLength + colorsInPalette * 4 + lineLength * (height - i - 1);
    for(var j = 0; j < width; j += 2){
      var b = buf[sourcePos++];

      var b1 = b >> 4;
      palette.copy(rgbaData, rgbPos, b1 * 4, b1 * 4 + 4);
      rgbPos += 4;

      var b2 = b & 15;
      palette.copy(rgbaData, rgbPos, b2 * 4, b2 * 4 + 4);
      rgbPos += 4;
    }
  }

  applyAndMask(buf, rgbaData, width, height, headerLength + colorsInPalette * 4 + lineLength * height);

  return rgbaData;
}
