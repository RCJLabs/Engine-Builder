// @expect no eval, Function or import() (code made at run time is code no rule has read)
// @expect no eval, Function or import() (code made at run time is code no rule has read)
export const run = (code: string) => eval(code);
export const make = (body: string) => new Function('x', body);
