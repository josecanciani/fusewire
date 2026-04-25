/* lexical grammar */
%lex
%%

\s+                   /* skip whitespace */
"!"                   return '!';
"?"                   return '?';
":"                   return ':';
"in"\b                return 'IN';

/* Strings */
\'(?:[^'\\]|\\.)*\'   return 'STRING';
\"(?:[^"\\]|\\.)*\"   return 'STRING';

/* Variables (e.g. $isVisible, user.name) */
[$a-zA-Z_][$a-zA-Z0-9_]*(?:\.[$a-zA-Z_][$a-zA-Z0-9_]*)*   return 'VAR';

<<EOF>>               return 'EOF';

/lex

/* operator associations and precedence */
%right '?' ':'
%right '!'

%start expressions

%% /* language grammar */

expressions
    : e EOF
        { return $1; }
    ;

e
    : e '?' e ':' e
        { $$ = { type: 'Ternary', condition: $1, trueExpr: $3, falseExpr: $5 }; }
    | '!' e
        { $$ = { type: 'Negation', expr: $2 }; }
    | VAR 'IN' VAR
        { $$ = { type: 'ForEach', item: { type: 'VarPath', value: $1 }, list: { type: 'VarPath', value: $3 } }; }
    | STRING
        { $$ = { type: 'String', value: $1.slice(1, -1) }; }
    | VAR
        { $$ = { type: 'VarPath', value: $1 }; }
    ;
