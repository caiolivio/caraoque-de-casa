# 🎤 Huliokê

*Produto by Life is a Huli.*

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
- **Mac:** dê dois cliques em `Iniciar Hulioke.command`. Ele abre o Terminal, instala o que falta na primeira vez, liga o servidor e abre a TV no Chrome. Para desligar, feche a janela do Terminal. Na primeira vez, se o Mac disser que não pode verificar o desenvolvedor, abra Ajustes do Sistema › Privacidade e Segurança e clique em **Abrir Mesmo Assim**.
- **Linux:** `./iniciar.sh`.

Para sair do modo quiosque: `Alt+F4` (Windows) ou `Cmd+Q` (macOS).

## Como usar

**No celular**
- **Buscar:** digite a música ou o artista. A palavra "karaoke" é adicionada sozinha (desmarque "Só versões karaokê" se não quiser). Também dá para colar um link do YouTube.
- **Fila:** mostra o que está tocando, a ordem e quantas músicas faltam para a sua. Você pode tirar as suas músicas da fila.
- Quando chegar sua vez, o celular vibra e mostra "É a sua vez!".

**Durante a música**, a TV mostra no canto quem está cantando, as próximas da fila e um QR code pequeno para a galera continuar escolhendo.

**Anfitrião** (aba Anfitrião no celular, com o PIN)
- Pausar, continuar, pular, recomeçar a música e ajustar o volume.
- Na aba Fila: subir, descer, mandar para o topo e remover qualquer música.

**Teclado do PC da TV**
- `Espaço` pausa ou continua · `→` pula · `F` tela cheia

Vídeos que o dono bloqueou para tocar fora do YouTube são pulados sozinhos, e quem escolheu recebe um aviso.

## Administração: PIN, listas e aparência

No PC da TV, abra **http://localhost:3000/admin**. Ali aparecem o PIN do anfitrião e os endereços. Do celular, a mesma página abre pela aba Anfitrião › "Gerenciar listas, foto de fundo e logo" (pede o PIN).

- **Listas de músicas:** a lista "Life is a Huli" já vem criada. Crie outras (Anos 80, Sertanejo…), adicione músicas buscando ou colando o link do YouTube, reordene e exclua. As listas aparecem como botões na tela de busca do celular, e a primeira abre sozinha.
- **Foto de fundo:** ideal 1920 × 1080 px (16:9), JPG, até 2 MB. O assunto principal deve ficar no centro, porque no celular a foto é cortada nas laterais. A foto aparece escurecida para o texto continuar legível.
- **Vídeo de fundo da TV:** MP4, 1920 × 1080 px, de 10 a 30 segundos, que fique bom repetindo em loop (até 100 MB, ideal abaixo de 30 MB). Toca sem som nas telas de espera da TV, no lugar da foto, e pausa durante a música. Nos celulares continua a foto.
- **Logo:** PNG com fundo transparente, cerca de 1000 × 400 px, em versão clara.

Tudo fica salvo na pasta `data/` do projeto (não vai para o GitHub). Para levar para outro PC, copie essa pasta.

## Músicas próprias

Suba a música no YouTube como vídeo com a letra na tela e deixe a visibilidade como **Não listado**: só quem tem o link acha, mas ela toca normalmente aqui. Confira em "Mais opções" que **Permitir incorporação** está marcado. Depois cole o link na lista "Life is a Huli" pela administração.

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
