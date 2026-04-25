export interface ASTNode {
    type: string;
    value?: string;
    expr?: ASTNode;
    condition?: ASTNode;
    trueExpr?: ASTNode;
    falseExpr?: ASTNode;
    item?: ASTNode;
    list?: ASTNode;
}

export function parse(input: string): ASTNode;

declare const parser: {
    parse: typeof parse;
};

export default parser;
