-- One-time token convergence. Review before running in production.
update public.categories
set color = case
  when lower(color) in ('#a8e6cf', '#3f7a5c', '#62d99a') then '#62D99A'
  when lower(color) in ('#ffd3b6', '#ffaaa5', '#ff8b94', '#b5544b', '#f2a57e') then '#F2A57E'
  when lower(color) in ('#f4e4ba', '#d8cfbc', '#e4c36b') then '#E4C36B'
  when lower(color) in ('#b8c0ff', '#b79bcb') then '#B79BCB'
  when lower(color) in ('#9ee7e5', '#7fb4c7') then '#7FB4C7'
  else '#7FB4C7'
end
where lower(color) not in ('#62d99a', '#f2a57e', '#e4c36b', '#b79bcb', '#7fb4c7');
