import type { ReactNode } from "react";

export type Column<Row> = {
  key: string;
  label: string;
  width?: string | number;
  align?: "left" | "right" | "center";
  mono?: boolean;
  muted?: boolean;
  render?: (row: Row) => ReactNode;
};

export function DataTable<Row extends { id: string }>({ columns, rows, caption }: { columns: Column<Row>[]; rows: Row[]; caption?: string }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table className="rv-table">
        {caption ? <caption className="rv-sr">{caption}</caption> : null}
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col" style={{ width: column.width, textAlign: column.align }}>
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={column.mono ? "rv-mono" : column.muted ? "rv-muted" : undefined}
                  style={{ textAlign: column.align }}
                >
                  {column.render ? column.render(row) : (row as Record<string, unknown>)[column.key] as ReactNode}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
