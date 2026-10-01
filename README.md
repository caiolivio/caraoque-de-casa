# 🎤 Caraoquê de casa

Karaokê caseiro: o PC ligado na TV toca vídeos do YouTube e a galera monta a fila pelo celular, lendo um QR code na tela. A TV mostra quem vai cantar, com contagem regressiva para dar tempo de pegar o microfone.

Roda tudo no seu PC, na rede de casa. Não precisa de VPS.

## Como rodar

1. Instale o [Node.js](https://nodejs.org) versão 20.12 ou mais nova (a versão LTS serve).
2. Baixe este projeto e, na pasta dele, rode:

   ```bash
   npm install
   npm start
   ```

3. O terminal mostra os endereços e o **PIN do anfitrião**:

   ```
   TV (abra neste PC):       http://localhost:3000/tv
   Celulares (mesmo Wi-Fi):  http://192.168.0.10:3000
   PIN do anfitrião:         4821
   ```

4. No PC ligado na TV, abra `http://localhost:3000/tv` no Chrome e clique na tela (o navegador só libera som depois de um clique).
5. Os amigos escaneiam o QR code da TV, colocam o nome e escolhem as músicas.

No Windows, na primeira vez, o Firewall pergunta se o Node pode acessar a rede: marque **Redes privadas** e permita. Sem isso, os celulares não conseguem entrar.

### Atalho para abrir tudo de uma vez

- **Windows:** dê dois cliques em `iniciar.bat`. Ele sobe o servidor e abre o Chrome em tela cheia (modo quiosque) já liberando o som.
- **Linux/macOS:** `./iniciar.sh`.

Para sair do modo quiosque: `Alt+F4` (Windows) ou `Cmd+Q` (macOS).

## Como usar

**No celular**
- **Buscar:** digite a música ou o artista. A palavra "karaoke" é adicionada sozinha (desmarque "Só versões karaokê" se não quiser). Também dá para colar um link do YouTube.
- **Fila:** mostra o que está tocando, a ordem e quantas músicas faltam para a sua. Você pode tirar as suas músicas da fila.
- Quando chegar sua vez, o celular vibra e mostra "É a sua vez!".

**Anfitrião** (aba Anfitrião, com o PIN do terminal)
- Pausar, continuar, pular, recomeçar a música e ajustar o volume.
- Na aba Fila: subir, descer, mandar para o topo e remover qualquer música.

**Teclado do PC da TV**
- `Espaço` pausa ou continua · `→` pula · `F` tela cheia

Vídeos que o dono bloqueou para tocar fora do YouTube são pulados sozinhos, e quem escolheu recebe um aviso.

## Configuração (opcional)

Copie `.env.example` para `.env` e ajuste:

| Variável | Para quê |
|---|---|
| `PORT` | Porta do servidor (padrão 3000). |
| `HOST_PIN` | PIN fixo do anfitrião. Vazio = um PIN novo a cada vez que o servidor sobe. |
| `YOUTUBE_API_KEY` | Deixa a busca mais confiável e só traz vídeos que podem ser incorporados. Sem ela, a busca lê a página de resultados do YouTube, que funciona mas pode quebrar se o YouTube mudar o site. |
| `PUBLIC_URL` | Endereço do QR code. Útil com Cloudflare Tunnel, para quem está fora do Wi-Fi. |

### Como pegar uma chave da YouTube API (grátis)

1. Acesse o [Google Cloud Console](https://console.cloud.google.com/), crie um projeto.
2. Em "APIs e serviços" ative a **YouTube Data API v3**.
3. Em "Credenciais", crie uma **chave de API** e cole em `YOUTUBE_API_KEY` no `.env`.

A cota grátis dá cerca de 100 buscas por dia. Buscas repetidas ficam em cache por 30 minutos.

## Dicas de áudio e TV

- Ligue os microfones na placa/mesa e use o **retorno direto** dela. Se a voz passar pelo PC, ela chega atrasada.
- Ligue a saída de áudio do PC na mesma placa/mesa, assim você controla música e voz separadamente.
- Coloque a TV em **Modo Jogo** para reduzir o atraso da imagem.
- Desative a suspensão e o protetor de tela do PC.
- Reserve um IP fixo para o PC no roteador, para o QR code não mudar. Rede de convidados com "isolamento de clientes" impede os celulares de acessar; use a rede principal.
- Para ver vídeos sem anúncios, deixe o Chrome do PC logado numa conta com YouTube Premium.

## Para desenvolver

```bash
npm run dev   # reinicia o servidor a cada alteração
npm test      # testes da fila e da busca
```

Veja `CLAUDE.md` para a arquitetura e as próximas funcionalidades planejadas.
