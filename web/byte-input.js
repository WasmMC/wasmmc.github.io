(function(global) {
  'use strict';

  function byteArray(values) {
    if (!values.length) throw new Error('No bytes parsed.');
    return Uint8Array.from(values);
  }

  function parseByteInput(raw) {
    const input=String(raw??'').trim();
    if(!input) throw new Error('No bytes parsed.');

    if(/\\x/i.test(input)) {
      const values=[];
      const token=/\\x([0-9a-fA-F]{2})/gi;
      let match;
      while((match=token.exec(input))!==null) values.push(parseInt(match[1],16));
      const residue=input.replace(token,'').trim();
      if(!values.length||!(residue===''||/^[bB]?(["'])\1$/.test(residue))) {
        throw new Error('Malformed byte escapes. Use complete \\xNN sequences.');
      }
      return byteArray(values);
    }

    if(/0[xX]/.test(input)) {
      const values=[];
      const token=/0[xX]([0-9a-fA-F]{1,2})(?![0-9a-fA-F])/g;
      let match;
      while((match=token.exec(input))!==null) values.push(parseInt(match[1],16));
      const residue=input.replace(token,'@').trim();
      const list='@(?:(?:\\s*,\\s*|\\s+)@)*';
      const braced='\\{\\s*'+list+'\\s*\\}';
      const declaration='(?:static\\s+)?(?:const\\s+)?(?:unsigned\\s+char|uint8_t|std::uint8_t|byte)\\s+[A-Za-z_]\\w*\\s*\\[\\s*\\]\\s*=\\s*';
      const accepted=new RegExp('^(?:(?:'+list+')|(?:'+braced+')|(?:'+declaration+braced+'))\\s*;?$','i');
      if(!values.length||!accepted.test(residue)) {
        throw new Error('Malformed 0x byte list. Use values from 0x00 to 0xFF.');
      }
      return byteArray(values);
    }

    if(/^[0-9a-fA-F]+$/.test(input)) {
      if(input.length%2!==0) throw new Error('Odd number of hex digits.');
      return byteArray(input.match(/../g).map(value=>parseInt(value,16)));
    }

    if(/^[0-9a-fA-F]{2}(?:[\s,:]+[0-9a-fA-F]{2})*$/.test(input)) {
      return byteArray(input.match(/[0-9a-fA-F]{2}/g).map(value=>parseInt(value,16)));
    }

    throw new Error('Malformed hexadecimal input. Use byte pairs such as 90 C3.');
  }

  global.WasmMCByteInput=Object.freeze({parse:parseByteInput});
})(globalThis);
