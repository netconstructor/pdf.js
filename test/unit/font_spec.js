/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */

'use strict';

describe('font', function() {
  function hexDump(bytes) {
    var line = '';
    for (var i = 0, ii = bytes.length; i < ii; ++i) {
      var b = bytes[i].toString(16);
      if (b.length < 2)
        b = '0' + b;
      line += b.toString(16);
    }
    return line;
  }
  // This example font comes from the CFF spec:
  // http://www.adobe.com/content/dam/Adobe/en/devnet/font/pdfs/5176.CFF.pdf
  var exampleFont = '0100040100010101134142434445462b' +
                    '54696d65732d526f6d616e000101011f' +
                    'f81b00f81c02f81d03f819041c6f000d' +
                    'fb3cfb6efa7cfa1605e911b8f1120003' +
                    '01010813183030312e30303754696d65' +
                    '7320526f6d616e54696d657300000002' +
                    '010102030e0e7d99f92a99fb7695f773' +
                    '8b06f79a93fc7c8c077d99f85695f75e' +
                    '9908fb6e8cf87393f7108b09a70adf0b' +
                    'f78e14';
  var fontData = [];
  for (var i = 0; i < exampleFont.length; i += 2) {
    var hex = exampleFont.substr(i, 2);
    fontData.push(parseInt(hex, 16));
  }
  var bytes = new Uint8Array(fontData);
  fontData = {getBytes: function() { return bytes}};

  function bytesToString(bytesArray) {
    var str = '';
    for (var i = 0, ii = bytesArray.length; i < ii; i++)
      str += String.fromCharCode(bytesArray[i]);
    return str;
  }

  describe('CFFParser', function() {
    var parser = new CFFParser(fontData, {});
    var cff = parser.parse();

    it('parses header', function() {
      var header = cff.header;
      expect(header.major).toEqual(1);
      expect(header.minor).toEqual(0);
      expect(header.hdrSize).toEqual(4);
      expect(header.offSize).toEqual(1);
    });

    it('parses name index', function() {
      var names = cff.names;
      expect(names.length).toEqual(1);
      expect(names[0]).toEqual('ABCDEF+Times-Roman');
    });

    it('sanitizes name index', function() {
      var index = new CFFIndex();
      index.add(['['.charCodeAt(0), 'a'.charCodeAt(0)]);

      var names = parser.parseNameIndex(index);
      expect(names).toEqual(['_a']);

      index = new CFFIndex();
      var longName = [];
      for (var i = 0; i < 129; i++)
        longName.push(0);
      index.add(longName);
      names = parser.parseNameIndex(index);
      expect(names[0].length).toEqual(127);
    });

    it('parses string index', function() {
      var strings = cff.strings;
      expect(strings.count).toEqual(3);
      expect(strings.get(0)).toEqual('.notdef');
      expect(strings.get(391)).toEqual('001.007');
    });

    it('parses top dict', function() {
      var topDict = cff.topDict;
      // 391 version 392 FullName 393 FamilyName 389 Weight 28416 UniqueID
      // -168 -218 1000 898 FontBBox 94 CharStrings 45 102 Private
      expect(topDict.getByName('version')).toEqual(391);
      expect(topDict.getByName('FullName')).toEqual(392);
      expect(topDict.getByName('FamilyName')).toEqual(393);
      expect(topDict.getByName('Weight')).toEqual(389);
      expect(topDict.getByName('UniqueID')).toEqual(28416);
      expect(topDict.getByName('FontBBox')).toEqual([-168, -218, 1000, 898]);
      expect(topDict.getByName('CharStrings')).toEqual(94);
      expect(topDict.getByName('Private')).toEqual([45, 102]);
    });

    it('parses predefined charsets', function() {
      var charset = parser.parseCharsets(0, 0, null, true);
      expect(charset.predefined).toEqual(true);
    });

    it('parses charset format 0', function() {
      // The first three bytes make the offset large enough to skip predefined.
      var bytes = new Uint8Array([0x00, 0x00, 0x00,
                                  0x00, // format
                                  0x00, 0x02 // sid/cid
                                ]);
      parser.bytes = bytes;
      var charset = parser.parseCharsets(3, 2, new CFFStrings(), false);
      expect(charset.charset[1]).toEqual('exclam');

      // CID font
      var charset = parser.parseCharsets(3, 2, new CFFStrings(), true);
      expect(charset.charset[1]).toEqual(2);
    });

    it('parses charset format 1', function() {
      // The first three bytes make the offset large enough to skip predefined.
      var bytes = new Uint8Array([0x00, 0x00, 0x00,
                                  0x01, // format
                                  0x00, 0x08, // sid/cid start
                                  0x01 // sid/cid left
                                ]);
      parser.bytes = bytes;
      var charset = parser.parseCharsets(3, 2, new CFFStrings(), false);
      expect(charset.charset).toEqual(['.notdef', 'quoteright', 'parenleft']);

      // CID font
      var charset = parser.parseCharsets(3, 2, new CFFStrings(), true);
      expect(charset.charset).toEqual(['.notdef', 8, 9]);
    });

    it('parses charset format 2', function() {
      // format 2 is the same as format 1 but the left is card16
      // The first three bytes make the offset large enough to skip predefined.
      var bytes = new Uint8Array([0x00, 0x00, 0x00,
                                  0x02, // format
                                  0x00, 0x08, // sid/cid start
                                  0x00, 0x01 // sid/cid left
                                ]);
      parser.bytes = bytes;
      var charset = parser.parseCharsets(3, 2, new CFFStrings(), false);
      expect(charset.charset).toEqual(['.notdef', 'quoteright', 'parenleft']);

      // CID font
      var charset = parser.parseCharsets(3, 2, new CFFStrings(), true);
      expect(charset.charset).toEqual(['.notdef', 8, 9]);
    });

    it('parses encoding format 0', function() {
      // The first two bytes make the offset large enough to skip predefined.
      var bytes = new Uint8Array([0x00, 0x00,
                                  0x00, // format
                                  0x01, // count
                                  0x08  // start
                                ]);
      parser.bytes = bytes;
      var encoding = parser.parseEncoding(2, {}, new CFFStrings(), null);
      expect(encoding.encoding).toEqual({0x8: 1});
    });

    it('parses encoding format 1', function() {
      // The first two bytes make the offset large enough to skip predefined.
      var bytes = new Uint8Array([0x00, 0x00,
                                  0x01, // format
                                  0x01, // num ranges
                                  0x07, // range1 start
                                  0x01 // range2 left
                                ]);
      parser.bytes = bytes;
      var encoding = parser.parseEncoding(2, {}, new CFFStrings(), null);
      expect(encoding.encoding).toEqual({0x7: 0x01, 0x08: 0x02});
    });

    it('parses fdselect format 0', function() {
      var bytes = new Uint8Array([0x00, // format
                                  0x00, // gid: 0 fd: 0
                                  0x01 // gid: 1 fd: 1
                                ]);
      parser.bytes = bytes;
      var fdSelect = parser.parseFDSelect(0, 2);
      expect(fdSelect.fdSelect).toEqual([0, 1]);
    });

    it('parses fdselect format 3', function() {
      var bytes = new Uint8Array([0x03, // format
                                  0x00, 0x02, // range count
                                  0x00, 0x00, // first gid
                                  0x09, // font dict 1 id
                                  0x00, 0x02, // nex gid
                                  0x0a, // font dict 2 gid
                                  0x00, 0x04 // sentinel (last gid)
                                ]);
      parser.bytes = bytes;
      var fdSelect = parser.parseFDSelect(0, 2);
      expect(fdSelect.fdSelect).toEqual([9, 9, 0xa, 0xa]);
    });
    // TODO fdArray
  });
  describe('CFFCompiler', function() {
    it('encodes integers', function() {
      var c = new CFFCompiler();
      // all the examples from the spec
      expect(c.encodeInteger(0)).toEqual([0x8b]);
      expect(c.encodeInteger(100)).toEqual([0xef]);
      expect(c.encodeInteger(-100)).toEqual([0x27]);
      expect(c.encodeInteger(1000)).toEqual([0xfa, 0x7c]);
      expect(c.encodeInteger(-1000)).toEqual([0xfe, 0x7c]);
      expect(c.encodeInteger(10000)).toEqual([0x1c, 0x27, 0x10]);
      expect(c.encodeInteger(-10000)).toEqual([0x1c, 0xd8, 0xf0]);
      expect(c.encodeInteger(100000)).toEqual([0x1d, 0x00, 0x01, 0x86, 0xa0]);
      expect(c.encodeInteger(-100000)).toEqual([0x1d, 0xff, 0xfe, 0x79, 0x60]);
    });
    it('encodes floats', function() {
      var c = new CFFCompiler();
      expect(c.encodeFloat(-2.25)).toEqual([0x1e, 0xe2, 0xa2, 0x5f]);
      expect(c.encodeFloat(5e-11)).toEqual([0x1e, 0x5c, 0x11, 0xff]);
    });
    // TODO a lot more compiler tests
  });
});
