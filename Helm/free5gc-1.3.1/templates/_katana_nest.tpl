{{/* Change only the reviewed SST 1 / SD 010203 slice; keep other slices intact. */}}
{{- define "katana.nest.sd" -}}
{{- $sd := trimPrefix "0x" (toString .slice.sd) -}}
{{- if and (hasKey .root.Values.global "katanaNestSd") (eq (toString .slice.sst) "1") (eq $sd "010203") -}}
{{- lower .root.Values.global.katanaNestSd -}}
{{- else -}}
{{- $sd -}}
{{- end -}}
{{- end -}}

{{/*
ponytail: upstream core configuration is stored as YAML strings. Match adjacent
SST/SD fields only; migrate to structured chart values before adding other layouts.
*/}}
{{- define "katana.nest.core" -}}
{{- if hasKey .root.Values.global "katanaNestSd" -}}
{{- $pattern := `(?m)(\bsst:[ \t]+1[ \t]*(?:#[^\n]*)?\n[ \t]*sd:[ \t]+)(?:"010203"|'010203'|010203)([ \t]*(?:#[^\n]*)?$)` -}}
{{- regexReplaceAll $pattern .text (printf `${1}"%s"${2}` (lower .root.Values.global.katanaNestSd)) -}}
{{- else -}}
{{- .text -}}
{{- end -}}
{{- end -}}
