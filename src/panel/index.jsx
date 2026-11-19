import React, { useEffect, useState } from 'react';
import ForgeReconciler, { Text, SectionMessage, Heading, useProductContext } from '@forge/react';
import { invoke } from '@forge/bridge';

const App = () => {
  const { extension } = useProductContext();
  const issueKey = extension && extension.issue ? extension.issue.key : null;
  const [triage, setTriage] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!issueKey) {
      setLoaded(true);
      return;
    }
    invoke('getTriage', { issueKey })
      .then((res) => {
        setTriage(res && res.triage ? res.triage : null);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [issueKey]);

  if (!loaded) {
    return <Text>Loading triage…</Text>;
  }

  if (!triage) {
    return (
      <SectionMessage title="Not triaged yet" appearance="information">
        <Text>
          Ask the Jira Triage Agent in Rovo chat to triage this issue. It will classify the
          priority, check for duplicates, suggest an assignee from past work, and draft a fix
          plan.
        </Text>
      </SectionMessage>
    );
  }

  return (
    <>
      <Heading size="medium">Last triage</Heading>
      {triage.priorityName ? <Text>Priority: {triage.priorityName}</Text> : null}
      {triage.assigneeName ? <Text>Suggested assignee: {triage.assigneeName}</Text> : null}
      {triage.duplicateKeys && triage.duplicateKeys.length ? (
        <Text>Possible duplicates: {triage.duplicateKeys.join(', ')}</Text>
      ) : (
        <Text>Possible duplicates: none found</Text>
      )}
      {triage.updatedAt ? <Text>Triaged at: {triage.updatedAt}</Text> : null}
      {triage.report ? <Text>{triage.report.slice(0, 600)}</Text> : null}
    </>
  );
};

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
