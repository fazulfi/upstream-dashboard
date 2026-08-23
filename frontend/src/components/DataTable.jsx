import React, { useState } from 'react';
import {
  useTable,
  flexRender,
  tableFeatures,
  columnFilteringFeature,
  globalFilteringFeature,
  rowSortingFeature,
  rowPaginationFeature,
  columnVisibilityFeature,
  createFilteredRowModel,
  createSortedRowModel,
  createPaginatedRowModel,
  filterFn_includesString,
  sortFn_alphanumeric,
} from '@tanstack/react-table';
import { Search, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

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

export default function DataTable({ columns, data, searchable = true, placeholder = 'Search table…' }) {
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
    <div className="w-full flex flex-col rounded-xl border border-zinc-800 bg-zinc-900/40 overflow-hidden">
      <div className="p-3 border-b border-zinc-800/80 flex flex-wrap items-center justify-between gap-3 bg-zinc-900/60">
        {searchable && (
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              className="w-full bg-zinc-950/70 border border-zinc-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:border-sky-500 focus:ring-1 focus:ring-sky-500/30 outline-none transition-all"
              placeholder={placeholder}
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              aria-label="Search table"
            />
          </div>
        )}
        <div className="flex items-center gap-1 bg-zinc-950/60 p-0.5 rounded-lg border border-zinc-800 text-[11px]">
          <button
            type="button"
            className={`px-2 py-1 rounded font-medium transition-colors ${
              density === 'compact' ? 'bg-zinc-800 text-zinc-100 shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
            }`}
            onClick={() => setDensity('compact')}
          >
            Compact
          </button>
          <button
            type="button"
            className={`px-2 py-1 rounded font-medium transition-colors ${
              density === 'comfortable' ? 'bg-zinc-800 text-zinc-100 shadow-sm' : 'text-zinc-400 hover:text-zinc-200'
            }`}
            onClick={() => setDensity('comfortable')}
          >
            Comfortable
          </button>
        </div>
      </div>

      <div className="w-full overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id} className="border-b border-zinc-800 bg-zinc-950/40 text-zinc-400 font-semibold uppercase tracking-wider text-[10px]">
                {hg.headers.map((h) => {
                  const isSorted = h.column.getIsSorted();
                  const alignRight = h.column.columnDef.meta?.align === 'right';
                  return (
                    <th
                      key={h.id}
                      className={`px-4 py-3 select-none ${alignRight ? 'text-right' : 'text-left'}`}
                      style={{ width: h.column.columnDef.meta?.width }}
                    >
                      <div
                        className={`inline-flex items-center gap-1.5 cursor-pointer hover:text-zinc-200 transition-colors ${
                          alignRight ? 'justify-end' : ''
                        }`}
                        onClick={h.column.getToggleSortingHandler()}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') h.column.toggleSorting();
                        }}
                      >
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        <span className="text-zinc-400">
                          {isSorted === 'asc' ? (
                            <ArrowUp size={12} className="text-sky-400" />
                          ) : isSorted === 'desc' ? (
                            <ArrowDown size={12} className="text-sky-400" />
                          ) : (
                            <ArrowUpDown size={11} className="opacity-40" />
                          )}
                        </span>
                      </div>
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-zinc-800/50">
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                className="hover:bg-zinc-800/30 transition-colors text-zinc-300"
              >
                {row.getVisibleCells().map((cell) => {
                  const alignRight = cell.column.columnDef.meta?.align === 'right';
                  const py = density === 'compact' ? 'py-2' : 'py-3.5';
                  return (
                    <td
                      key={cell.id}
                      className={`px-4 ${py} ${alignRight ? 'text-right font-mono' : ''}`}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  );
                })}
              </tr>
            ))}
            {table.getRowModel().rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center text-zinc-500 text-xs">
                  No matching records found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="p-3 border-t border-zinc-800/80 bg-zinc-950/40 flex flex-wrap items-center justify-between gap-3 text-xs text-zinc-400">
        <span className="font-mono text-[11px]">{filteredCount} total records</span>
        <div className="flex items-center gap-3">
          <select
            aria-label="Rows per page"
            value={pageSize}
            onChange={(e) => {
              const v = Number(e.target.value);
              table.setPageSize(v);
            }}
            className="bg-zinc-900 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-300 outline-none"
          >
            {[8, 10, 25, 50].map((n) => (
              <option key={n} value={n}>
                {n} / page
              </option>
            ))}
          </select>
          <div className="flex items-center gap-1">
            <button
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="p-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-zinc-800 transition-colors"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="px-2 font-mono text-[11px]">
              {pageIndex + 1} / {pageCount}
            </span>
            <button
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="p-1 rounded bg-zinc-900 border border-zinc-800 text-zinc-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-zinc-800 transition-colors"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
