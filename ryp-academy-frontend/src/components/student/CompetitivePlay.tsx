import React from 'react';
import Card from '../Card';

export type Event = {
  id: string;
  name: string;
  date: string;
  type: string;
  leaderboard?: string;
  standings?: string;
  results?: string;
  seasonDates?: string;
};

type CompetitivePlayProps = {
  events: Event[];
  setModal: (modal: { open: boolean; title: string; message: React.ReactNode }) => void;
};

const CompetitivePlay: React.FC<CompetitivePlayProps> = ({ events, setModal }) => {
  const tournaments = events.filter((e) => e.type === 'tournament_instance');
  const leagues = events.filter((e) => e.type === 'league_season');
  const cashGames = events.filter((e) => e.type === 'cash_game');

  return (
    <div>
      <Card>
        <h3 className="font-semibold mb-2">Tournaments</h3>
        <ul>
          {tournaments.map((t) => (
            <li key={t.id} className="mb-2">
              <span className="font-bold">{t.name}</span> - {t.date}
              {t.leaderboard && (
                <button
                  className="ml-2 text-blue-500 underline"
                  onClick={() =>
                    setModal({
                      open: true,
                      title: 'Leaderboard',
                      message: (
                        <pre>{JSON.stringify(JSON.parse(t.leaderboard || '{}'), null, 2)}</pre>
                      ),
                    })
                  }
                >
                  View Leaderboard
                </button>
              )}
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <h3 className="font-semibold mb-2">Leagues</h3>
        <ul>
          {leagues.map((l) => (
            <li key={l.id} className="mb-2">
              <span className="font-bold">{l.name}</span> - {l.seasonDates}
              {l.standings && (
                <button
                  className="ml-2 text-blue-500 underline"
                  onClick={() =>
                    setModal({
                      open: true,
                      title: 'Standings',
                      message: (
                        <pre>{JSON.stringify(JSON.parse(l.standings || '{}'), null, 2)}</pre>
                      ),
                    })
                  }
                >
                  View Standings
                </button>
              )}
            </li>
          ))}
        </ul>
      </Card>
      <Card>
        <h3 className="font-semibold mb-2">Cash Games</h3>
        <ul>
          {cashGames.map((c) => (
            <li key={c.id} className="mb-2">
              <span className="font-bold">{c.name}</span> - {c.date}
              {c.results && (
                <button
                  className="ml-2 text-blue-500 underline"
                  onClick={() =>
                    setModal({
                      open: true,
                      title: 'Results',
                      message: (
                        <pre>{JSON.stringify(JSON.parse(c.results || '{}'), null, 2)}</pre>
                      ),
                    })
                  }
                >
                  View Results
                </button>
              )}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
};

export default CompetitivePlay; 