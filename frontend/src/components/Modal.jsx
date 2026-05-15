import { IoClose } from 'react-icons/io5'

function Modal({ isOpen, title, onClose, children }) {
  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
      <div className="card w-full max-w-2xl p-5 md:p-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="section-title">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close modal"
          >
            <IoClose size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export default Modal
