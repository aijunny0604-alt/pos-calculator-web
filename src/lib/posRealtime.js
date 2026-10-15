export const POS_REALTIME_TABLES = ['orders', 'products', 'customers', 'saved_carts', 'ai_learning'];

export function subscribePosChanges(client, onChange) {
  const channel = client.channel('pos_core_data');
  for (const table of POS_REALTIME_TABLES) {
    channel.on('postgres_changes', {event: '*', schema: 'public', table}, payload => onChange(table, payload));
  }
  channel.subscribe();
  return () => client.removeChannel(channel);
}

export function mergePosChange(rows, payload, format = row => row, prepend = false) {
  if (payload.eventType === 'DELETE') {
    return payload.old?.id == null ? rows : rows.filter(row => row.id !== payload.old.id);
  }
  if (!['INSERT', 'UPDATE'].includes(payload.eventType) || payload.new?.id == null) return rows;
  const record = format(payload.new);
  const index = rows.findIndex(row => row.id === record.id);
  if (index >= 0) return rows.map((row, i) => i === index ? record : row);
  return prepend ? [record, ...rows] : [...rows, record];
}
