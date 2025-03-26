{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  buildInputs = [
    pkgs.nodejs
    pkgs.yarn  # or pkgs.npm if you prefer npm
  ];

shellHook = ''
  export PS1='\[\e[38;5;208m\]\u\[\e[30;5;93m\]@shell:\w\$\[\e[0m\] '
    '';
}
