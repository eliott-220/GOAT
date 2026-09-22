import { useState } from 'react'
import { useApp } from '../state/context'
import { Avatar, PageHead, Panel, SportBadge } from './common'
import { Icon } from './Icon'
import { MiniProfileSheet } from './sheets'

export function EchoesTab() {
  const { app, snap } = useApp()
  const [profileID, setProfileID] = useState<string | null>(null)

  return (
    <>
      <PageHead title="Echos" />
      {snap.echoes.length === 0 ? (
        <div className="empty">
          <div className="empty-icon"><Icon name="radar" size={40} /></div>
          <p className="empty-title">Pas encore d'Echo</p>
          <p>Les Echos te suggèrent des pratiquants du même sport qui fréquentent régulièrement les mêmes endroits que toi. Ils apparaissent après quelques jours de pratique.</p>
        </div>
      ) : (
        <Panel title="Suggestions" count={snap.echoes.length}>
          {snap.echoes.map((echo) => (
            <div className="row" key={echo.id}>
              <button className="row-button person" onClick={() => setProfileID(echo.user.id)}>
                <Avatar name={echo.user.firstName} photo={echo.user.photoData} size={44} />
                <span className="row-main">
                  <span className="row-title">{echo.user.firstName}</span>
                  <SportBadge sportID={echo.sportID} />
                </span>
              </button>
              <button className="btn btn-outline btn-small" onClick={() => void app.requestAlliance(echo.user.id)}>
                Alliance
              </button>
            </div>
          ))}
        </Panel>
      )}
      {profileID && <MiniProfileSheet userID={profileID} onClose={() => setProfileID(null)} />}
    </>
  )
}
