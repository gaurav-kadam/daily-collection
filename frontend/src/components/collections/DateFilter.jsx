function DateFilter({ dateFrom, dateTo, onChange }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="block text-sm">
        <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">From</span>
        <input
          type="date"
          value={dateFrom}
          onChange={(event) => onChange('dateFrom', event.target.value)}
          className="input-field"
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">To</span>
        <input
          type="date"
          value={dateTo}
          onChange={(event) => onChange('dateTo', event.target.value)}
          className="input-field"
        />
      </label>
    </div>
  )
}

export default DateFilter
