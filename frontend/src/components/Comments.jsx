import { useState } from 'react';
import '../css/Comments.css';

export default function CommentBox({ pin, user, onAddComment, onUpdateComment, onDeleteComment, onLogin }) {
  const [comment, setComment] = useState('');
  const [activeMenuId, setActiveMenuId] = useState(null);
  const [editingCommentId, setEditingCommentId] = useState(null);
  const [editingText, setEditingText] = useState('');
  const [pendingDeleteCommentId, setPendingDeleteCommentId] = useState(null);

  const submit = (e) => {
    e.preventDefault();
    if (!user) {
      if (typeof onLogin === 'function') onLogin();
      else alert('Please login to comment.');
      return;
    }
    if (!comment.trim()) {
      alert('Please type a comment first.');
      return;
    }

    onAddComment(pin.id, comment.trim());
    setComment('');
  };

  const canEditComment = (commentEntry) => {
    if (!user) return false;
    return user?.id === commentEntry.user_id || user?.role === 'administrator';
  };

  const canDeleteComment = (commentEntry) => {
    if (!user) return false;
    return (
      user?.id === commentEntry.user_id ||
      user?.id === pin.user_id ||
      user?.role === 'administrator' ||
      user?.role === 'admin'
    );
  };

  const canManageComment = (commentEntry) => canEditComment(commentEntry) || canDeleteComment(commentEntry);

  const startEdit = (commentEntry) => {
    setEditingCommentId(commentEntry.id);
    setEditingText(commentEntry.comment);
    setActiveMenuId(null);
  };

  const cancelEdit = () => {
    setEditingCommentId(null);
    setEditingText('');
  };

  const saveEdit = async () => {
    if (!editingText.trim()) {
      alert('Comment cannot be empty.');
      return;
    }

    await onUpdateComment(pin.id, editingCommentId, editingText.trim());
    cancelEdit();
  };

  const requestDelete = (commentId) => {
    setActiveMenuId(null);
    setPendingDeleteCommentId(commentId);
  };

  const cancelDelete = () => {
    setPendingDeleteCommentId(null);
  };

  const confirmDelete = async () => {
    const commentId = pendingDeleteCommentId;
    if (!commentId) return;

    setPendingDeleteCommentId(null);
    await onDeleteComment(pin.id, commentId);
  };

  return (
    <div className="popup-comments">
      <strong>Comments</strong>
      <div className="comment-list">
        {pin.comments?.length ? pin.comments.map((c) => (
          <div key={c.id} className="comment-item">
            {editingCommentId === c.id ? (
              <div className="comment-editing">
                <input
                  value={editingText}
                  onChange={(e) => setEditingText(e.target.value)}
                  placeholder="Edit your comment"
                />
                <div className="comment-edit-actions">
                  <button type="button" className="secondary-btn" onClick={cancelEdit}>Cancel</button>
                  <button type="button" className="primary-btn" onClick={saveEdit}>Save</button>
                </div>
              </div>
            ) : (
              <>
                <div className="comment-row-top">
                  <p>{c.comment}</p>
                  {canManageComment(c) && (
                    <div className="comment-menu-wrapper">
                      <button
                        type="button"
                        className="comment-menu-btn"
                        onClick={() => setActiveMenuId(activeMenuId === c.id ? null : c.id)}
                        aria-label="Comment actions"
                      >
                        ⋯
                      </button>
                      {activeMenuId === c.id && (
                        <div className="comment-menu">
                          {canEditComment(c) && <button type="button" onClick={() => startEdit(c)}>Edit</button>}
                          {canDeleteComment(c) && (
                            <button type="button" className="danger-btn" onClick={() => requestDelete(c.id)}>Delete</button>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {pendingDeleteCommentId === c.id && (
                  <div className="comment-delete-confirmation">
                    <span>Delete this comment?</span>
                    <div className="comment-delete-actions">
                      <button type="button" className="secondary-btn" onClick={cancelDelete}>Cancel</button>
                      <button type="button" className="danger-btn" onClick={confirmDelete}>Delete</button>
                    </div>
                  </div>
                )}
                <small>— {c.commented_by}</small>
              </>
            )}
          </div>
        )) : <small>No comments yet.</small>}
      </div>
      <form onSubmit={submit} className="comment-form">
        <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Add a comment" />
        <div className="comment-form-actions">
          <button type="submit">Comment</button>
        </div>
      </form>
    </div>
  );
}
