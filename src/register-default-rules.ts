import { nestedRule } from "./nested-rule";
import { register } from "./registry";
import { stepdownRule } from "./stepdown-rule";

register(stepdownRule);
register(nestedRule);
