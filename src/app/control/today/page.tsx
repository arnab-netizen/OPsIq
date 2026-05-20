'use client';

import { useEffect, useState } from 'react';
import { toOperatorSafeError } from "@/lib/operator-safe-errors";

interface ActionItem {
  decisionId: string;
  problem: string;
  expectedImpact: number;
  confidence: number;
  priorityScore: number;
  reason: string;
}

interface RiskItem {
  decisionId: string;
  problem: string;
  atRisk: number;
  blockedAtRisk: number;
  reason: string;
}

interface ControlSurface {
  workspaceId: string;
  date: string;
  topActions: ActionItem[];
  risks: RiskItem[];
  blockedValue: number;
  totalImpactToday: number;
  missedIfIgnored: number;
}

export default function ControlTodayPage() {
  const [data, setData] = useState<ControlSurface | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [workspaceId, setWorkspaceId] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const wsId = params.get('workspaceId');

    if (!wsId) {
      setError('Workspace ID required');
      setLoading(false);
      return;
    }

    setWorkspaceId(wsId);

    const fetchData = async () => {
      try {
        const response = await fetch(
          `/api/control/today?workspaceId=${wsId}`,
          {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );

        if (!response.ok) {
          throw new Error(`API error: ${response.status}`);
        }

        const surface = await response.json();
        setData(surface);
      } catch (err) {
        setError(toOperatorSafeError(err, "load").error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return <div style={{ padding: '20px' }}>Loading...</div>;
  }

  if (error) {
    return <div style={{ padding: '20px', color: 'red' }}>Error: {error}</div>;
  }

  if (!data) {
    return <div style={{ padding: '20px' }}>No data</div>;
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
      <h1>Control Dashboard</h1>
      <p>Workspace: {workspaceId} | Date: {data.date}</p>

      {/* Summary Metrics */}
      <section style={{ marginBottom: '30px' }}>
        <h2>Summary</h2>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: '15px',
          }}
        >
          <div
            style={{
              border: '1px solid #ccc',
              padding: '15px',
              borderRadius: '4px',
            }}
          >
            <div style={{ fontSize: '12px', color: '#666' }}>
              Total Impact Today
            </div>
            <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
              ${(data.totalImpactToday / 1000).toFixed(0)}k
            </div>
          </div>
          <div
            style={{
              border: '1px solid #ccc',
              padding: '15px',
              borderRadius: '4px',
            }}
          >
            <div style={{ fontSize: '12px', color: '#666' }}>
              Missed If Ignored
            </div>
            <div style={{ fontSize: '24px', fontWeight: 'bold', color: '#d9534f' }}>
              ${(data.missedIfIgnored / 1000).toFixed(0)}k
            </div>
          </div>
          <div
            style={{
              border: '1px solid #ccc',
              padding: '15px',
              borderRadius: '4px',
            }}
          >
            <div style={{ fontSize: '12px', color: '#666' }}>Blocked Value</div>
            <div style={{ fontSize: '24px', fontWeight: 'bold' }}>
              ${(data.blockedValue / 1000).toFixed(0)}k
            </div>
          </div>
        </div>
      </section>

      {/* Top Actions */}
      <section style={{ marginBottom: '30px' }}>
        <h2>Top Actions ({data.topActions.length})</h2>
        {data.topActions.length === 0 ? (
          <p style={{ color: '#999' }}>No actions available</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {data.topActions.map((action) => (
              <div
                key={action.decisionId}
                style={{
                  border: '1px solid #e0e0e0',
                  padding: '12px',
                  borderRadius: '4px',
                  backgroundColor: '#f9f9f9',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'start',
                    marginBottom: '8px',
                  }}
                >
                  <div>
                    <h4 style={{ margin: '0 0 4px 0' }}>{action.problem}</h4>
                    <p style={{ margin: '0', fontSize: '12px', color: '#666' }}>
                      {action.reason}
                    </p>
                  </div>
                  <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <div style={{ fontSize: '12px', color: '#999' }}>
                      Priority: {action.priorityScore}
                    </div>
                    <div style={{ fontSize: '12px', color: '#999' }}>
                      Confidence: {(action.confidence * 100).toFixed(0)}%
                    </div>
                  </div>
                </div>
                <div
                  style={{
                    fontSize: '13px',
                    fontWeight: 'bold',
                    color: '#0066cc',
                  }}
                >
                  Expected Impact: ${(action.expectedImpact / 1000).toFixed(0)}k
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Risks */}
      <section style={{ marginBottom: '30px' }}>
        <h2>Risks ({data.risks.length})</h2>
        {data.risks.length === 0 ? (
          <p style={{ color: '#999' }}>No risks identified</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {data.risks.map((risk) => (
              <div
                key={risk.decisionId}
                style={{
                  border: '2px solid #d9534f',
                  padding: '12px',
                  borderRadius: '4px',
                  backgroundColor: '#fff5f5',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'start',
                    marginBottom: '8px',
                  }}
                >
                  <div>
                    <h4 style={{ margin: '0 0 4px 0' }}>{risk.problem}</h4>
                    <p style={{ margin: '0', fontSize: '12px', color: '#666' }}>
                      {risk.reason}
                    </p>
                  </div>
                </div>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: '10px',
                    fontSize: '13px',
                  }}
                >
                  {risk.atRisk > 0 && (
                    <div style={{ color: '#d9534f' }}>
                      At Risk: ${(risk.atRisk / 1000).toFixed(0)}k
                    </div>
                  )}
                  {risk.blockedAtRisk > 0 && (
                    <div style={{ color: '#d9534f', fontWeight: 'bold' }}>
                      Blocked: ${(risk.blockedAtRisk / 1000).toFixed(0)}k
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
