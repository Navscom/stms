import { Fragment, useState, useEffect } from 'react';
import { Marker, Popup, Circle } from 'react-leaflet';
import { useMap } from 'react-leaflet';
import CommentBox from './Comments';
import { formatDuration } from '../utils/pinHelpers';
import { getDangerPinComments } from '../utils';
import { normalizeLatLng, normalizeRadius, centerMapWithOffset, formatTimestamp, SHARED_CANVAS_RENDERER } from './mapUtils';

export function DangerMarker({ pin, icon, style, highlighted, isNearby, user, onAddComment, onUpdateComment, onDeleteComment, onDeletePin, onLogin }) {
  const map = useMap();
  const [comments, setComments] = useState(pin.comments || []);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentsError, setCommentsError] = useState('');
  const [commentsLoaded, setCommentsLoaded] = useState(Array.isArray(pin.comments));

  useEffect(() => {
    setComments(pin.comments || []);
    setCommentsLoaded(Array.isArray(pin.comments));
    setCommentsError('');
  }, [pin.id]);

  const loadComments = async () => {
    if (commentsLoading) return;
    setCommentsLoading(true);
    setCommentsError('');
    try {
      const data = await getDangerPinComments(pin.id);
      setComments(Array.isArray(data) ? data : []);
      setCommentsLoaded(true);
    } catch (error) {
      setCommentsError('Unable to load comments.');
    } finally {
      setCommentsLoading(false);
    }
  };

  const handleAddComment = async (pinId, comment) => {
    await onAddComment(pinId, comment);
    await loadComments();
  };

  const handleUpdateComment = async (pinId, commentId, comment) => {
    await onUpdateComment(pinId, commentId, comment);
    await loadComments();
  };

  const handleDeleteComment = async (pinId, commentId) => {
    await onDeleteComment(pinId, commentId);
    await loadComments();
  };

  const center = normalizeLatLng(pin.lat, pin.lng);
  const radiusMeters = normalizeRadius(pin.radius_meters);

  return (
    <Fragment>
      <Circle
        center={center}
        renderer={SHARED_CANVAS_RENDERER}
        radius={radiusMeters}
        pathOptions={{
          color: style.color,
          fillColor: style.color,
          fillOpacity: isNearby ? 0.35 : 0.16,
        }}
      />
      <Marker
        position={[pin.lat, pin.lng]}
        icon={icon}
        eventHandlers={{
          click: (event) => {
            if (typeof event.stopPropagation === 'function') event.stopPropagation();
            if (event.originalEvent && typeof event.originalEvent.stopPropagation === 'function') {
              event.originalEvent.stopPropagation();
            }
            centerMapWithOffset(map, event.latlng || { lat: pin.lat, lng: pin.lng }, 18);
          },
        }}
      >
        <Popup
          maxWidth={320}
          eventHandlers={{
            popupopen: () => {
              loadComments();
            },
          }}
        >
          <div onClick={(e) => e.stopPropagation()}>
            <strong>{pin.danger_type}: {pin.title}</strong><br />
            Severity: <b>{pin.severity}</b><br />
            Radius: {pin.radius_meters}m<br />
            {formatDuration(pin) && <>Duration: {formatDuration(pin)}<br /></>}
            <small>Reported by: {pin.reported_by}</small><br />
            <small>Reported on: {formatTimestamp(pin.created_at)}</small>
            <p>{pin.description}</p>
            <CommentBox
              pin={pin}
              comments={comments}
              commentsLoading={commentsLoading}
              commentError={commentsError}
              user={user}
              onAddComment={handleAddComment}
              onUpdateComment={handleUpdateComment}
              onDeleteComment={handleDeleteComment}
              onLogin={onLogin}
            />
            <DeletePinBox pin={pin} user={user} onDeletePin={onDeletePin} />
          </div>
        </Popup>
      </Marker>
    </Fragment>
  );
}

export function DeletePinBox({ pin, user, onDeletePin }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const canDelete = user?.id === pin.user_id || user?.role === 'administrator' || user?.role === 'admin';

  if (!canDelete) {
    return (
      <div className="delete-pin-note">
        <small>Only the reporting user or an administrator can delete this pin.</small>
      </div>
    );
  }

  return (
    <div className="delete-pin-box">
      <label>
        <input type="checkbox" checked={confirmDelete} onChange={(e) => setConfirmDelete(e.target.checked)} />
        Confirm delete this pin
      </label>
      <button type="button" className="secondary-btn" disabled={!confirmDelete} onClick={() => onDeletePin(pin.id)}>
        Delete pin
      </button>
    </div>
  );
}
