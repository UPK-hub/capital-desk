import * as React from "react";

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export interface DataTableProps extends React.HTMLAttributes<HTMLDivElement> {
  tableClassName?: string;
}

export function DataTable({ className, tableClassName, children, ...props }: DataTableProps) {
  return (
    <div className={cx("data-table-wrap", className)} {...props}>
      <div className="data-table-scroll">
        <table className={cx("data-table", tableClassName)}>{children}</table>
      </div>
    </div>
  );
}

export interface DataTableHeaderProps extends React.HTMLAttributes<HTMLTableSectionElement> {}

export function DataTableHeader({ className, children, ...props }: DataTableHeaderProps) {
  return (
    <thead className={cx("data-table-header", className)} {...props}>
      {children}
    </thead>
  );
}

export interface DataTableBodyProps extends React.HTMLAttributes<HTMLTableSectionElement> {}

export function DataTableBody({ className, children, ...props }: DataTableBodyProps) {
  return (
    <tbody className={cx("data-table-body", className)} {...props}>
      {children}
    </tbody>
  );
}

export interface DataTableRowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  clickable?: boolean;
}

export function DataTableRow({ className, clickable, children, ...props }: DataTableRowProps) {
  return (
    <tr
      className={cx("data-table-row group", clickable && "data-table-row--clickable", className)}
      {...props}
    >
      {children}
    </tr>
  );
}

export interface DataTableHeadProps extends React.ThHTMLAttributes<HTMLTableCellElement> {}

export function DataTableHead({ className, children, ...props }: DataTableHeadProps) {
  return (
    <th className={cx("data-table-head", className)} {...props}>
      {children}
    </th>
  );
}

export interface DataTableCellProps extends React.TdHTMLAttributes<HTMLTableCellElement> {
  mono?: boolean;
}

export function DataTableCell({ className, mono, children, ...props }: DataTableCellProps) {
  return (
    <td className={cx("data-table-cell", mono && "data-table-cell--mono", className)} {...props}>
      {children}
    </td>
  );
}
