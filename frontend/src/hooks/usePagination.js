import { useMemo, useState } from 'react'

const usePagination = (items = [], initialSize = 10) => {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(initialSize)

  const totalPages = Math.max(1, Math.ceil(items.length / pageSize))
  const currentPage = Math.min(page, totalPages)

  const paginatedItems = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return items.slice(start, start + pageSize)
  }, [currentPage, items, pageSize])

  return {
    currentPage,
    pageSize,
    setPage,
    setPageSize,
    totalPages,
    paginatedItems,
  }
}

export default usePagination
