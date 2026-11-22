export function run({ text: s, header }) {
  const n = s.length;
  if (n === 0) return { columns: null, rows: [], errors: [] };

  // Pre-calculate closing quote positions in a single pass.
  // F[i+1] will store the index of the closing quote for a field starting with a quote at index i.
  const F = new Int32Array(n + 1);
  F[n] = -1;
  let r = 0;
  for (let x = n - 1; x >= 0; x--) {
    if (s.charCodeAt(x) === 34) {
      r++;
      F[x] = r & 1 ? x + r - 1 : F[x + r];
    } else {
      r = 0;
      F[x] = F[x + 1];
    }
  }

  const errors = [];
  const records = [];
  let i = s.charCodeAt(0) === 0xfeff ? 1 : 0;
  let line = 1;
  let width = -1;

  while (i < n) {
    const fields = [];
    const recLine = line;
    // Match the exact row indexing logic of the reference.
    const row = header ? (records.length === 0 ? null : records.length - 1) : records.length;
    let started = false;
    let more = true;

    while (more) {
      let piece = "";
      if (i < n && s.charCodeAt(i) === 34 && F[i + 1] >= 0) {
        started = true;
        const c = F[i + 1];
        let j = i + 1;
        let seg = j;
        // Quoted field: handle escapes and normalized newlines efficiently.
        while (j < c) {
          const ch = s.charCodeAt(j);
          if (ch === 34 || ch === 10 || ch === 13) {
            if (j > seg) piece += s.slice(seg, j);
            if (ch === 34) {
              piece += '"';
              j += 2;
            } else {
              piece += "\n";
              if (ch === 13 && s.charCodeAt(j + 1) === 10) j += 2;
              else j++;
              line++;
            }
            seg = j;
          } else {
            j++;
          }
        }
        if (j > seg) piece += s.slice(seg, j);
        i = c + 1;

        // Junk handling after a quoted field.
        let out = "";
        let junkStarted = false;
        while (i < n) {
          const ch = s.charCodeAt(i);
          if (ch === 44 || ch === 10) break;
          if (ch === 13) {
            if (s.charCodeAt(i + 1) === 10) break;
            errors.push({ code: "stray_cr", line: recLine, row });
            i++;
            continue;
          }
          let start = i;
          while (i < n) {
            const c2 = s.charCodeAt(i);
            if (c2 === 44 || c2 === 10 || c2 === 13) break;
            i++;
          }
          out += s.slice(start, i);
          junkStarted = true;
        }
        if (junkStarted) {
          started = true;
          if (out.length > 0) errors.push({ code: "quote_junk", line: recLine, row });
          piece += out;
        }
      } else {
        if (i < n && s.charCodeAt(i) === 34) {
          errors.push({ code: "unterminated_quote", line: recLine, row });
        }
        // Plain field or unterminated quote: skip stray CRs and collect text.
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
          let start = i;
          while (i < n) {
            const c2 = s.charCodeAt(i);
            if (c2 === 44 || c2 === 10 || c2 === 13) break;
            i++;
          }
          out += s.slice(start, i);
          started = true;
        }
        piece = out;
      }

      fields.push(piece);

      // Check for delimiter and update state.
      if (i >= n) {
        more = false;
      } else {
        const ch = s.charCodeAt(i);
        if (ch === 44) {
          i++;
          started = true;
        } else if (ch === 10) {
          i++;
          line++;
          more = false;
        } else {
          // CRLF (skips both 13 and 10) or stray CR (also skips 2 by reference logic).
          i += 2;
          line++;
          more = false;
        }
      }
    }

    // Only add non-empty records (lines with at least one field or delimiter).
    if (!started) continue;

    // Row length validation.
    if (width === -1) {
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
    rows: header ? records.slice(1) : records,
    errors,
  };
}
