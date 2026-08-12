import { useState } from 'react';
import {
  useTable, flexRender,
  tableFeatures,
  columnFilteringFeature, globalFilteringFeature, rowSortingFeature, rowPaginationFeature,
  columnVisibilityFeature,
  createFilteredRowModel, createSortedRowModel, createPaginatedRowModel,
  filterFn_includesString, sortFn_alphanumeric,
} from '@tanstack/react-table';

/**
 * DataTable — enterprise table wrapper (TanStack Table v9, feature composition).
 * Fitur: sort per kolom, global search, pagination (rows per page select),
 * density (compact/comfortable), hover highlight.
 */
const features = tableFeatures({
  columnFilteringFeature,
  globalFilteringFeature,
  rowSortingFeature,
  rowPaginationFeature,
  columnVisibilityFeature,
  filteredRowModel: createFilteredRowModel(),
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  filterFns: { includesString: filterFn_includesString },
  sortFns: { alphanumeric: sortFn_alphanumeric },
});

export default function DataTable({ columns, data, searchable = true }) {
  const [sorting, setSorting] = useState([]);
  const [globalFilter, setGlobalFilter] = useState('');
  const [pagination, setPagination] = useState({ pageIndex: 0, pageSize: 10 });
  const [density, setDensity] = useState('comfortable');

  const table = useTable({
    features,
    columns,
    data,
    state: { sorting, globalFilter, pagination },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPagination,
  });

  const { pageIndex, pageSize } = table.state.pagination;
  const filteredCount = table.getFilteredRowModel().rows.length;
  const pageCount = Math.max(1, Math.ceil(filteredCount / pageSize));

  return (
    <div className="datatable">
      <div className="dt-toolbar">
        {searchable && (
          <input
            className="dt-search"
            placeholder="Search providers…"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            aria-label="Search table"
          />
        )}
        <div className="dt-density" role="group" aria-label="Density">
          {['compact', 'comfortable'].map((dim) => (
            <button key={dim} className={density === dim ? 'on' : ''} onClick={() => setDensity(dim)}>{dim}</button>
          ))}
        </div>
      </div>
      <div className="dt-scroll">
        <table className={`tbl tbl-${density}`}>
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => (
                  <th key={h.id} className={h.column.columnDef.meta?.align === 'right' ? 'right' : ''}
                      style={{ width: h.column.columnDef.meta?.width }}>
                    <div className="th-wrap" onClick={h.column.getToggleSortingHandler()}
                         role="button" tabIndex={0}
                         onKeyDown={(e) => { if (e.key === 'Enter') h.column.toggleSorting(); }}>
                      {flexRender(h.column.columnDef.header, h.getContext())}
                      <span className="th-sort">
                        {h.column.getIsSorted() === 'asc' ? '↑' : h.column.getIsSorted() === 'desc' ? '↓' : ''}
                      </span>
                    </div>
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className={cell.column.columnDef.meta?.align === 'right' ? 'right' : ''}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
            {table.getRowModel().rows.length === 0 && (
              <tr><td colSpan={columns.length} className="dt-empty">No providers found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="dt-pager">
        <span className="faint tnum">{filteredCount} providers</span>
        <div className="dt-page-actions">
          <select aria-label="Rows per page" value={pageSize}
                  onChange={(e) => { const v = Number(e.target.value); table.setPageSize(v); }}>
            {[8, 10, 25, 50].map((n) => <option key={n} value={n}>{n} / page</option>)}
          </select>
          <button onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>‹</button>
          <span className="tnum faint">{pageIndex + 1}/{pageCount}</span>
          <button onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>›</button>
        </div>
      </div>
    </div>
  );
}
