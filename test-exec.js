const {exec} = require('child_process'); exec('node -e "console.log(process.argv)" "foo (1).txt"', (err, out) => console.log(out.trim()))
