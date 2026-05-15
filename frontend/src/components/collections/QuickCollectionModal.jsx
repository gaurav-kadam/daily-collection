import Modal from '../Modal'
import CollectionForm from './CollectionForm'

function QuickCollectionModal({ isOpen, customerId, customers, saving, onClose, onSubmit }) {
  return (
    <Modal isOpen={isOpen} title="Quick Collection" onClose={onClose}>
      <CollectionForm
        customers={customers}
        selectedCustomerId={customerId}
        saving={saving}
        onSubmit={onSubmit}
      />
    </Modal>
  )
}

export default QuickCollectionModal
