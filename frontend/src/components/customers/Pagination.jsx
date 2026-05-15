import { FiChevronLeft, FiChevronRight } from 'react-icons/fi'

function Pagination({ page, totalPages, total, pageSize, onPageChange, onPageSizeChange }) {
  const start = total ? (page - 1) * pageSize + 1 : 0
  const end = Math.min(page * pageSize, total || 0)

  return (
    <div className="flex flex-col gap-3 border-t border-slate-100 px-4 py-3 text-sm text-slate-600 sm:flex-row sm:items-center sm:justify-between">
      <p>
        Showing {start}-{end} of {total || 0}
      </p>
      <div className="flex items-center gap-2">
        <select
          value={pageSize}
          onChange={(event) => onPageSizeChange(Number(event.target.value))}
          className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"
          aria-label="Rows per page"
        >
          {[10, 20, 50].map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="rounded-lg border border-slate-300 p-2 disabled:opacity-40"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
        >
          <FiChevronLeft />
        </button>
        <span className="min-w-20 text-center">
          {page} / {totalPages || 1}
        </span>
        <button
          type="button"
          className="rounded-lg border border-slate-300 p-2 disabled:opacity-40"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= (totalPages || 1)}
          aria-label="Next page"
        >
          <FiChevronRight />
        </button>
      </div>
    </div>
  )
}

export default Pagination
