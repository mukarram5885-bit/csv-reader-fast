export function run({ text, header }) {
  const s = text;
  const n = s.length;
  const F = closers(s);
  const errors = [];
  const records = [];
  const rowOf = (k) => (header ? (k === 0 ? null : k - 1) : k);
  let width = -1;
  let i = n > 0 && s.charCodeAt(0) === 0xfeff ? 1 : 0;
  let line = 1;

  const readPlain = (recLine, row, state) => {
    let out = "";
    while (i < n) {
      const ch = s.charCodeAt(i);
      if (ch === 44 || ch === 10) break;
      if (ch === 13) {
        if (s.charCodeAt(i + 1) === 10) break;
        errors.push({ code: "stray_cr", line: recLine, row });
        i++;
        continue;
      }
      let j = i + 1;
      while (j < n) {
        const c = s.charCodeAt(j);
        if (c === 44 || c === 10 || c === 13) break;
        j++;
      }
      out += s.slice(i, j);
      state.started = true;
      i = j;
    }
    return out;
  };

  while (i < n) {
    const k = records.length;
    const row = rowOf(k);
    const recLine = line;
    const fields = [];
    const state = { started: false };
    let more = true;

    while (more) {
      let piece = "";

      if (i < n && s.charCodeAt(i) === 34 && F[i + 1] >= 0) {
        state.started = true;
        const c = F[i + 1];
        let j = i + 1;
        let seg = j;
        while (j < c) {
          const ch = s.charCodeAt(j);
          if (ch === 34) {
            piece += s.slice(seg, j) + '"';
            j += 2;
            seg = j;
          } else if (ch === 13) {
            piece += s.slice(seg, j) + "\n";
            j += s.charCodeAt(j + 1) === 10 ? 2 : 1;
            line++;
            seg = j;
          } else if (ch === 10) {
            piece += s.slice(seg, j) + "\n";
            j++;
            line++;
            seg = j;
          } else {
            j++;
          }
        }
        piece += s.slice(seg, c);
        i = c + 1;

        const junk = readPlain(recLine, row, state);
        if (junk.length > 0) errors.push({ code: "quote_junk", line: recLine, row });
        piece += junk;
      } else {
        if (i < n && s.charCodeAt(i) === 34) {
          errors.push({ code: "unterminated_quote", line: recLine, row });
        }
        piece = readPlain(recLine, row, state);
      }

      fields.push(piece);

      if (i >= n) {
        more = false;
      } else {
        const ch = s.charCodeAt(i);
        if (ch === 44) {
          i++;
          state.started = true;
        } else if (ch === 10) {
          i++;
          line++;
          more = false;
        } else {
          i += 2;
          line++;
          more = false;
        }
      }
    }

    if (!state.started) continue;

    if (k === 0) {
      width = fields.length;
    } else if (fields.length < width) {
      errors.push({ code: "short_row", line: recLine, row, fields: fields.length });
      while (fields.length < width) fields.push("");
    } else if (fields.length > width) {
      errors.push({ code: "long_row", line: recLine, row, extra: fields.slice(width) });
      fields.length = width;
    }
    records.push(fields);
  }

  return {
    columns: header && records.length > 0 ? records[0] : null,
    rows: records.slice(header ? 1 : 0),
    errors,
  };
}

function closers(s) {
  const n = s.length;
  const F = new Int32Array(n + 1);
  const run = new Int32Array(n + 1);
  F[n] = -1;
  for (let x = n - 1; x >= 0; x--) {
    if (s.charCodeAt(x) !== 34) {
      F[x] = F[x + 1];
      continue;
    }
    const L = (run[x] = 1 + run[x + 1]);
    F[x] = L & 1 ? x + L - 1 : F[x + L];
  }
  return F;
}
