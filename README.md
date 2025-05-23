# HCB donor graph

Create a donor graph for transparent HCB organisations.

<img src="https://graph.hcb.hackclub.com/hq?max_rows=5">
<sub>Hack Club HQ's donor graph (first five rows)</sub>

## Docs

Just embed `graph.hcb.hackclub.com`, like so:

```
https://graph.hcb.hackclub.com/{org-slug}
```

For example:

```html
<img src="http://graph.hcb.hackclub.com/htop?icon_size=240" width="200">
```

### Options

All of these are optional (pun not intended). All of these must be a positive number.

- `icon_size` - Size of the icon in pixels.
- `gap` - Gap between each icon in pixels.
- `max_columns` - The maximum amount of avatars per column of the grid.
- `max_rows` - The maximum amount of avatars per row of the grid.
- `width` - If you want to opt out of our autogenerated width, pass this in
- `height` - If you want to opt out of our autogenerated height, pass this in

## Running the graph service locally

### Without Docker

You'll need the latest version of [Bun](https://bun.sh) installed. This method is what we recommend for most users.

Run these commands to clone the repo and start the service:

```bash
git clone https://github.com/hackclub/hcb-donor-graph && cd hcb-donor-graph
bun start
```

The server will be running at port 3000.

### With Docker

Run these commands to clone the repo and use the `Dockerfile`:

```bash
git clone https://github.com/hackclub/hcb-donor-graph && cd hcb-donor-graph
docker build -t hcb-donor-graph .
docker run -d -p 3000:3000 hcb-donor-graph
```

The server will be running at port 3000.

---

<sup>
Licensed under the <a href="LICENSE-MIT">MIT License</a>.
</sup>

<br>

<sub>
Unless you explicitly state otherwise, any contribution intentionally submitted
for inclusion in this application by you shall be licensed as above, without any additional terms or conditions.
</sub>
