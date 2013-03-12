var pixelData = module.exports = function(buf){
  // header size
  // TODO implement for non-32-bit bitmaps
  var pos = buf.readUInt32LE(0);
  var width = buf.readInt32LE(4);
  var height = buf.readInt32LE(8) / 2;
  var depth = buf.readUInt16LE(14);

  var rgbaData = new Buffer(width * height * 4);

  var lineLength = width * depth / 8;

  // BMP renders bottom-to-top, png renders top-to-bottom
  for(var i = 0; i < height; ++i){
    var p = pos + lineLength * i;
    buf.copy(rgbaData, lineLength * (height - i - 1), p, p + lineLength);
  }

  // Apply AND mask
  for(var i = 0; i < height; ++i){
    for(var j = 0; j < width; j++){
      var x = buf[pos + lineLength * height + Math.floor((i * width + j) / 8)] >> (7 - j % 8) & 1;
      rgbaData[lineLength * (height - i - 1) + j * depth / 8 + 3] *= 1-x;
    }
  }

  // for some stupid crazy reason node-png inverts alpha
  for(var i = 3; i < rgbaData.length; i += 4){
    rgbaData[i] = 255 - rgbaData[i];
  }

  return rgbaData;
}
