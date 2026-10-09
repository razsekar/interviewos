export const wc = (s) => (String(s).trim().match(/\S+/g) || []).length;
