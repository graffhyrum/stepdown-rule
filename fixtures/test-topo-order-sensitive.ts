const b = () => c();
const a = () => c();
// 96h: when DAG has multiple orderings, we must pick one that minimizes violations
// A and B both call C. Order of A,B in output can create violation if wrong.
const c = () => "leaf";
