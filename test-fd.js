const buffer = Buffer.from('test');
const blob = new Blob([buffer], { type: 'text/plain' });
const fd = new FormData();
fd.append('file', blob, 'test.txt');
console.log([...fd.entries()][0]);
